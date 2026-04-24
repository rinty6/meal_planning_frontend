import React, { useState, useEffect, useMemo, useRef, startTransition } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TouchableWithoutFeedback } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";

import IngredientIcon from "../../../components/IngredientIcon";
import CustomAlert from "../../../components/customAlert";
import SuccessModal from "../../../components/sucessmodal";
import FoodFactsCard from "../../../components/FoodFactsCard";
import { fetchFoodDetailForFacts } from "../../../services/mealAPI";
import { peekCachedRecommendations } from "../../../services/recommendation";

type ComboDetailItem = Record<string, any>;
type ComboDetailPayload = ComboDetailItem & { items?: ComboDetailItem[] };
type NutritionFactsState = NonNullable<Awaited<ReturnType<typeof fetchFoodDetailForFacts>>>["nutritionFacts"];
type CachedRecommendationResult = NonNullable<ReturnType<typeof peekCachedRecommendations>>["result"];

const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const firstFiniteNumber = (...values: any[]) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const hasMeaningfulMacroSnapshot = (item: any) =>
  [item?.calories, item?.protein, item?.carbs, item?.fats, item?.fat].some((value) => Number(value) > 0);

const mergeFoodSnapshot = (base: any, resolved: any) => {
  const merged = { ...(base || {}), ...(resolved || {}) };
  const shouldUseResolvedMacros = hasMeaningfulMacroSnapshot(resolved) || !hasMeaningfulMacroSnapshot(base);

  merged.id = String(resolved?.id || resolved?.food_id || base?.id || base?.food_id || "").trim();
  merged.food_id = String(resolved?.food_id || resolved?.id || base?.food_id || base?.id || "").trim();
  merged.fatsecret_food_id = String(resolved?.fatsecret_food_id || base?.fatsecret_food_id || "").trim();
  merged.title = resolved?.title || base?.title || resolved?.food_name || base?.food_name || "Unknown Item";
  merged.food_name = resolved?.food_name || base?.food_name || merged.title;
  merged.image = resolved?.image || base?.image || "";
  merged.calories = shouldUseResolvedMacros
    ? firstFiniteNumber(resolved?.calories, base?.calories)
    : firstFiniteNumber(base?.calories, resolved?.calories);
  merged.protein = shouldUseResolvedMacros
    ? firstFiniteNumber(resolved?.protein, base?.protein)
    : firstFiniteNumber(base?.protein, resolved?.protein);
  merged.carbs = shouldUseResolvedMacros
    ? firstFiniteNumber(resolved?.carbs, base?.carbs)
    : firstFiniteNumber(base?.carbs, resolved?.carbs);
  merged.fats = shouldUseResolvedMacros
    ? firstFiniteNumber(resolved?.fats, resolved?.fat, base?.fats, base?.fat)
    : firstFiniteNumber(base?.fats, base?.fat, resolved?.fats, resolved?.fat);

  return merged;
};

const getDishIdentity = (dish: any) =>
  String(dish?.fatsecret_food_id || dish?.food_id || dish?.id || dish?.title || "")
    .trim()
    .toLowerCase();

const getCachedRecommendationItems = (result?: CachedRecommendationResult | null): ComboDetailItem[] => {
  if (!result?.recommendationsByMeal) return [];

  return Object.values(result.recommendationsByMeal).flatMap((mealEntries) =>
    mealEntries.flatMap((entry: ComboDetailItem) =>
      Array.isArray(entry?.items) && entry.items.length > 0 ? entry.items : [entry]
    )
  );
};

const FoodDetailScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { userId } = useAuth();

  const [adding, setAdding] = useState(false);
  const [showMealSelector, setShowMealSelector] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [nutritionFacts, setNutritionFacts] = useState<NutritionFactsState | null>(null);
  const [detailItem, setDetailItem] = useState<ComboDetailItem | null>(null);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [selectedDish, setSelectedDish] = useState<ComboDetailItem | null>(null);
  const latestNutritionRequestRef = useRef(0);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const rawItem = params.itemData || params.comboData;
  const item = rawItem ? (JSON.parse(rawItem as string) as ComboDetailPayload) : null;
  // NOTE: Combo detail renders a main + side + drink (fallback to single item).
  const comboItems = useMemo<ComboDetailItem[]>(
    () => (Array.isArray(item?.items) && item.items.length > 0 ? item.items : item ? [item] : []),
    [item]
  );
  const resolvedSingleItem = useMemo(
    () => (comboItems.length === 1 ? mergeFoodSnapshot(comboItems[0] || item, detailItem) : null),
    [comboItems, detailItem, item]
  );
  const displayComboItems = useMemo(
    () => (resolvedSingleItem ? [resolvedSingleItem] : comboItems),
    [comboItems, resolvedSingleItem]
  );
  const selectedDateParam = Array.isArray(params.selectedDate) ? params.selectedDate[0] : params.selectedDate;
  const dateFromPlanning =
    typeof selectedDateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(selectedDateParam)
      ? selectedDateParam
      : null;

  useEffect(() => {
    if (comboItems.length > 0) {
      setSelectedDish((prev) => prev || comboItems[0]);
    }
  }, [comboItems]);

  // Fetch detailed nutrition facts when item loads, with cache-first strategy
  useEffect(() => {
    const fetchNutritionData = async () => {
      if (!selectedDish) return;

      const requestId = latestNutritionRequestRef.current + 1;
      latestNutritionRequestRef.current = requestId;
      setLoadingNutrition(true);
      try {
        const explicitFatSecretId = String(selectedDish?.fatsecret_food_id || "").trim();
        const fallbackFoodId = String(selectedDish?.food_id || selectedDish?.id || "").trim();
        const hasResolvableFatSecretId =
          !!(explicitFatSecretId || fallbackFoodId) &&
          !String(explicitFatSecretId || fallbackFoodId).startsWith("local-");
        
        // Attempt to seed from cached recommendation data first
        if (!hasResolvableFatSecretId) {
          const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
          const cachedData = apiURL && userId ? peekCachedRecommendations({ 
            apiURL, 
            userId, 
            mealType: "all" 
          }) : null;

          const cachedItems = getCachedRecommendationItems(cachedData?.result);
          if (cachedItems.length > 0) {
            const matchingItem = cachedItems.find(
              (rec: any) => getDishIdentity(rec) === getDishIdentity(selectedDish)
            );
            if (
              latestNutritionRequestRef.current === requestId &&
              matchingItem &&
              (matchingItem.calories || matchingItem.protein)
            ) {
              setDetailItem(mergeFoodSnapshot(selectedDish, matchingItem));
            }
          }
        }
        
        const payload = await fetchFoodDetailForFacts(selectedDish, {
          allowTitleFallback: !hasResolvableFatSecretId,
        });
        console.log("[comboDetail] loaded detail payload", {
          requestedFoodId: String(explicitFatSecretId || fallbackFoodId || ""),
          resolvedFoodId: String(payload?.item?.food_id || payload?.item?.id || ""),
        });

        if (latestNutritionRequestRef.current !== requestId) return;
        
        // Update with fresh facts in a non-blocking transition
        startTransition(() => {
          setNutritionFacts(payload?.nutritionFacts || null);
          setDetailItem(payload?.item || selectedDish);
        });
      } catch (error) {
        console.error("Error fetching nutrition facts:", error);
        if (latestNutritionRequestRef.current !== requestId) return;
        setNutritionFacts(null);
        setDetailItem(selectedDish);
      } finally {
        if (latestNutritionRequestRef.current === requestId) {
          setLoadingNutrition(false);
        }
      }
    };

    fetchNutritionData();
  }, [selectedDish, userId]);

  const showAlert = (title: string, message: string, onConfirm = () => setAlertVisible(false), onCancel?: () => void) => {
    setAlertConfig({ title, message, onConfirm, onCancel });
    setAlertVisible(true);
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    router.back();
  };

  const handleAddToLog = () => {
    if (!userId) {
      showAlert("Error", "You must be logged in to save meals.");
      return;
    }
    setShowMealSelector(true);
  };

  const handleSelectMeal = (type: string) => {
    setShowMealSelector(false);
    saveItemsToDB(type);
  };

  const saveItemsToDB = async (mealType: string) => {
    if (!userId) return;
    setAdding(true);
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
    const dateStr = dateFromPlanning || formatLocalYYYYMMDD(new Date());

    try {
      const itemsToSave =
        displayComboItems.length > 0
          ? displayComboItems
          : detailItem
            ? [mergeFoodSnapshot(item, detailItem)]
            : [];
      for (const comboItem of itemsToSave) {
        const payload = {
          clerkId: userId,
          date: dateStr,
          mealType,
          foodName: comboItem.title || "Unknown Item",
          calories: parseFloat(comboItem.calories) || 0,
          protein: parseFloat(comboItem.protein) || 0,
          carbs: parseFloat(comboItem.carbs) || 0,
          fats: parseFloat(comboItem.fats) || 0,
          image: comboItem.image || "",
        };

        const res = await fetch(`${apiURL}/api/meals/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Failed to save meal");
        }
      }

      setShowSuccess(true);
    } catch {
      showAlert("Error", "Could not save this food item.");
    } finally {
      setAdding(false);
    }
  };

  if (!item) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text>Unable to load food details.</Text>
      </SafeAreaView>
    );
  }

  const totalCalories =
    Number(item?.total_calories) ||
    displayComboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.calories || 0), 0);
  const totalProtein =
    Number(item?.total_protein) ||
    displayComboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.protein || 0), 0);
  const totalCarbs =
    Number(item?.total_carbs) ||
    displayComboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.carbs || 0), 0);
  const totalFats =
    Number(item?.total_fats) ||
    displayComboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.fats || 0), 0);

  const food = mergeFoodSnapshot(selectedDish || item, detailItem);
  const comboServingText = `${displayComboItems.length} items`;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 py-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="black" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-xl font-bold text-gray-500">Combo detail</Text>
        <View className="w-7" />
      </View>

      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
        <View className="h-64 rounded-3xl overflow-hidden mb-6 bg-gray-100 items-center justify-center">
          <View className="flex-row w-full h-full">
            {displayComboItems.slice(0, 3).map((comboItem: any, index: number) => (
              <View key={`${comboItem?.id || comboItem?.food_id}-${index}`} className="flex-1">
                {comboItem?.image ? (
                  <Image source={{ uri: comboItem.image }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <View className="w-full h-full items-center justify-center">
                    <IngredientIcon ingredientName={comboItem?.title} size={60} />
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        <View className="flex-row justify-center mb-6">
          <View className="flex-row items-center bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm mr-2">
            <Ionicons name="flame" size={20} color="black" />
            <Text className="font-bold ml-2 text-lg">{Math.round(Number(totalCalories))} kcal</Text>
          </View>
          <View className="flex-row items-center bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm">
            <Ionicons name="restaurant-outline" size={20} color="black" />
            <Text className="font-bold ml-2 text-sm">{comboServingText}</Text>
          </View>
        </View>

        <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-6 flex-row justify-around shadow-sm">
          <View className="items-center">
            <Text className="text-gray-400 mb-1">Fat</Text>
            <Text className="font-bold text-lg">{(Number(totalFats) || 0).toFixed(1)}g</Text>
          </View>
          <View className="items-center border-l border-gray-100 pl-8">
            <Text className="text-gray-400 mb-1">Protein</Text>
            <Text className="font-bold text-lg">{(Number(totalProtein) || 0).toFixed(1)}g</Text>
          </View>
          <View className="items-center border-l border-gray-100 pl-8">
            <Text className="text-gray-400 mb-1">Carbs</Text>
            <Text className="font-bold text-lg">{(Number(totalCarbs) || 0).toFixed(1)}g</Text>
          </View>
        </View>

        <Text className="text-center text-2xl font-bold text-gray-800 mb-6">{item?.title || food?.title}</Text>

        <View className="mb-6">
          <Text className="text-lg font-bold text-gray-900 mb-3">Included Dishes</Text>
          {displayComboItems.map((dish: any, index: number) => {
            const category = String(dish?.category || (index === 0 ? "main" : index === 2 ? "drink" : "side")).toLowerCase();
            const label =
              category === "main"
                ? "MAIN DISH"
                : category === "drink"
                  ? "SIDE (DRINK/BREAD)"
                  : "SIDE (VEG/FRUIT)";
            const isSelected = getDishIdentity(selectedDish) === getDishIdentity(dish);

            return (
              <TouchableOpacity
                key={`${dish?.id || dish?.food_id}-${index}`}
                onPress={() => setSelectedDish(dish)}
                className={`flex-row items-center p-3 rounded-2xl border mb-3 ${isSelected ? "border-primary" : "border-gray-200"}`}
              >
                <View className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 items-center justify-center mr-3">
                  {dish?.image ? (
                    <Image source={{ uri: dish.image }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <IngredientIcon ingredientName={dish?.title} size={36} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-orange-600 font-bold">{label}</Text>
                  <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
                    {dish?.title}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Ionicons name="flame-outline" size={14} color="#F97316" />
                    <Text className="text-gray-500 text-xs ml-1">{Math.round(Number(dish?.calories || 0))} kcal</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            );
          })}
        </View>

        {loadingNutrition ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="large" color="#007AFF" />
            <Text className="text-gray-500 mt-2">Loading nutrition facts...</Text>
          </View>
        ) : (
          <FoodFactsCard item={food} nutritionFacts={nutritionFacts} />
        )}

        <TouchableOpacity
          onPress={handleAddToLog}
          disabled={adding}
          className="w-full py-4 bg-primary rounded-2xl mb-10 shadow-md flex-row justify-center items-center"
        >
          {adding ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="add-circle" size={24} color="white" />
              <Text className="text-white text-center font-bold text-lg ml-2">Add to Meal Plan</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showMealSelector} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowMealSelector(false)}>
          <View className="flex-1 bg-black/50 justify-center items-center px-4">
            <TouchableWithoutFeedback>
              <View className="bg-white w-full max-w-xs p-6 rounded-3xl items-center shadow-xl">
                <Text className="text-xl font-bold text-gray-900 mb-2">Select Meal</Text>
                <Text className="text-gray-400 text-center text-sm mb-6">When are you eating this?</Text>
                <TouchableOpacity onPress={() => handleSelectMeal("breakfast")} className="w-full bg-white py-4 rounded-2xl mb-3 border border-gray-100 px-4">
                  <Text className="font-bold text-gray-700 text-base">Breakfast</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSelectMeal("lunch")} className="w-full bg-white py-4 rounded-2xl mb-3 border border-gray-100 px-4">
                  <Text className="font-bold text-gray-700 text-base">Lunch</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSelectMeal("dinner")} className="w-full bg-white py-4 rounded-2xl mb-6 border border-gray-100 px-4">
                  <Text className="font-bold text-gray-700 text-base">Dinner</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowMealSelector(false)}>
                  <Text className="text-gray-400 font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText="OK"
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
      />

      <SuccessModal
        visible={showSuccess}
        message="Meal added successfully!"
        onClose={handleCloseSuccess}
      />
    </SafeAreaView>
  );
};

export default FoodDetailScreen;
