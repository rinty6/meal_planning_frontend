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
import { buildNutritionFactsFromFood, fetchFoodDetailForFacts, getRecipeDetails } from "../../../services/mealAPI";
import { formatServingsLabel, getFoodServingText } from "../../../services/servingLabel";
import { peekCachedRecommendations } from "../../../services/recommendation";
import { markMealsSummaryDirty } from "../../../services/mealsSummaryStore";
import { authedFetch } from "../../../services/authedFetch";

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

// Treat only numeric ids as valid FatSecret food identifiers.
const isNumericFatSecretId = (value: any) => /^\d+$/.test(String(value ?? "").trim());
const normalizeKey = (value: any) => String(value ?? "").trim().toLowerCase();
const cleanId = (value: any) => String(value ?? "").trim();
const getSourceKey = (item: any) => normalizeKey(item?.source || item?.type || "");
const isRecipeLikeItem = (item: any) => {
  const id = cleanId(item?.id);
  const source = getSourceKey(item);
  return source.includes("recipe") || !!cleanId(item?.recipe_id) || id.startsWith("recipe-");
};
const isLocalOnlyItem = (item: any) => {
  const id = cleanId(item?.id);
  const externalId = cleanId(item?.externalId || item?.external_id);
  const source = getSourceKey(item);
  return (
    id.startsWith("local-") ||
    id.startsWith("custom-") ||
    externalId.startsWith("local-") ||
    externalId.startsWith("custom-") ||
    externalId.startsWith("title:") ||
    source.includes("custom") ||
    source.includes("local")
  );
};
const hasFoodDetailSignals = (item: any) => {
  const source = getSourceKey(item);
  return (
    source === "fatsecret_food" ||
    source === "food" ||
    item?.type === "food" ||
    !!item?.food_type ||
    !!item?.food_url ||
    !!item?.brand_name ||
    !!item?.serving_id
  );
};
const getFallbackFatSecretFoodId = (item: any) => {
  if (isRecipeLikeItem(item) || isLocalOnlyItem(item)) return "";

  for (const value of [item?.food_id, item?.externalId, item?.external_id]) {
    if (isNumericFatSecretId(value)) return cleanId(value);
  }

  const id = cleanId(item?.id);
  return hasFoodDetailSignals(item) && isNumericFatSecretId(id) ? id : "";
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

// Single id-resolution shared by the View Recipe button and the servings lookup.
const deriveRecipeId = (dish: any, item: any) =>
  cleanId(
    dish?.recipe_id ||
    item?.recipe_id ||
    dish?.externalId ||
    item?.externalId ||
    (cleanId(dish?.id || item?.id).startsWith("recipe-")
      ? cleanId(dish?.id || item?.id).replace(/^recipe-/, "")
      : "")
  );

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
  const { userId, getToken } = useAuth();

  const [adding, setAdding] = useState(false);
  const [showMealSelector, setShowMealSelector] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [nutritionFacts, setNutritionFacts] = useState<NutritionFactsState | null>(null);
  const [detailItem, setDetailItem] = useState<ComboDetailItem | null>(null);
  const [detailItemRouteKey, setDetailItemRouteKey] = useState("");
  const [detailItemOwnerKey, setDetailItemOwnerKey] = useState("");
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [selectedDish, setSelectedDish] = useState<ComboDetailItem | null>(null);
  // Real serving count for recipe-like items (null until resolved; pill falls back to "1 serving").
  const [recipeServings, setRecipeServings] = useState<number | null>(null);
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

  const rawItemParam = params.itemData || params.comboData;
  const rawItemString = Array.isArray(rawItemParam) ? rawItemParam[0] : rawItemParam;
  const routePayloadKey = rawItemString || "";
  const item = useMemo<ComboDetailPayload | null>(() => {
    if (!rawItemString) return null;
    try {
      return JSON.parse(rawItemString) as ComboDetailPayload;
    } catch (error) {
      console.error("Combo detail payload parse error:", error);
      return null;
    }
  }, [rawItemString]);
  // NOTE: Combo detail renders a main + side + drink (fallback to single item).
  const comboItems = useMemo<ComboDetailItem[]>(
    () => (Array.isArray(item?.items) && item.items.length > 0 ? item.items : item ? [item] : []),
    [item]
  );
  const selectedDishInCurrentPayload = useMemo(() => {
    const selectedIdentity = getDishIdentity(selectedDish);
    if (!selectedIdentity) return null;
    return comboItems.find((dish) => getDishIdentity(dish) === selectedIdentity) || null;
  }, [comboItems, selectedDish]);
  const activeSelectedDish = selectedDishInCurrentPayload || comboItems[0] || item || null;
  const activeSelectedDishKey = getDishIdentity(activeSelectedDish);
  const activeIsRecipeLike = isRecipeLikeItem(activeSelectedDish || item);
  const currentDetailItem =
    detailItemRouteKey === routePayloadKey && detailItemOwnerKey === activeSelectedDishKey ? detailItem : null;
  const resolvedSingleItem = useMemo(
    () => (comboItems.length === 1 ? mergeFoodSnapshot(comboItems[0] || item, currentDetailItem) : null),
    [comboItems, currentDetailItem, item]
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
    latestNutritionRequestRef.current += 1;
    const nextDish = comboItems[0] || null;
    const snapshotFacts = nextDish && hasMeaningfulMacroSnapshot(nextDish)
      ? buildNutritionFactsFromFood(nextDish)
      : null;
    const nextDishIsRecipe = isRecipeLikeItem(nextDish);

    setSelectedDish(nextDish);
    setDetailItem(null);
    setDetailItemRouteKey(routePayloadKey);
    setDetailItemOwnerKey(getDishIdentity(nextDish));
    setNutritionFacts(snapshotFacts);
    setLoadingNutrition(!!nextDish && !snapshotFacts && !nextDishIsRecipe);
  }, [comboItems, routePayloadKey]);

  // Fetch detailed nutrition facts when item loads, with cache-first strategy
  useEffect(() => {
    const fetchNutritionData = async () => {
      if (!selectedDish) return;
      if (getDishIdentity(selectedDish) !== activeSelectedDishKey) return;

      const requestId = latestNutritionRequestRef.current + 1;
      latestNutritionRequestRef.current = requestId;
      const requestRouteKey = routePayloadKey;
      const requestOwnerKey = getDishIdentity(selectedDish);
      const snapshotFacts = hasMeaningfulMacroSnapshot(selectedDish)
        ? buildNutritionFactsFromFood(selectedDish)
        : null;
      startTransition(() => {
        setDetailItem(selectedDish);
        setDetailItemRouteKey(requestRouteKey);
        setDetailItemOwnerKey(requestOwnerKey);
        setNutritionFacts(snapshotFacts);
      });
      setLoadingNutrition(!snapshotFacts);
      if (isRecipeLikeItem(selectedDish)) {
        setLoadingNutrition(false);
        return;
      }
      try {
        const explicitFatSecretId = String(selectedDish?.fatsecret_food_id || "").trim();
        const fallbackFoodId = getFallbackFatSecretFoodId(selectedDish);
        const hasResolvableFatSecretId =
          isNumericFatSecretId(explicitFatSecretId) || isNumericFatSecretId(fallbackFoodId);
        
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
              const cachedSnapshot = mergeFoodSnapshot(selectedDish, matchingItem);
              setDetailItem(cachedSnapshot);
              setDetailItemRouteKey(requestRouteKey);
              setDetailItemOwnerKey(requestOwnerKey);
              setNutritionFacts(buildNutritionFactsFromFood(cachedSnapshot));
              setLoadingNutrition(false);
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
          setDetailItemRouteKey(requestRouteKey);
          setDetailItemOwnerKey(requestOwnerKey);
        });
      } catch (error) {
        console.error("Error fetching nutrition facts:", error);
        if (latestNutritionRequestRef.current !== requestId) return;
        setNutritionFacts(null);
        setDetailItem(selectedDish);
        setDetailItemRouteKey(requestRouteKey);
        setDetailItemOwnerKey(requestOwnerKey);
      } finally {
        if (latestNutritionRequestRef.current === requestId) {
          setLoadingNutrition(false);
        }
      }
    };

    fetchNutritionData();
  }, [selectedDish, userId, routePayloadKey, activeSelectedDishKey]);

  // Resolve the real serving count for recipe-like items. The recommendation payload
  // now carries `servings` (backend enrichment) — trust it when it's > 1. A missing
  // value or exactly 1 is ambiguous (older payloads coerce unknown to 1), so confirm
  // against the recipe detail — the same source the recipe page reads — ensuring the
  // two screens always agree (see ERROR_LOG Error 060 follow-up).
  useEffect(() => {
    let cancelled = false;
    setRecipeServings(null);
    if (!activeIsRecipeLike) return;

    const payloadServings = Math.round(Number(activeSelectedDish?.servings ?? item?.servings));
    if (Number.isFinite(payloadServings) && payloadServings > 1) {
      setRecipeServings(payloadServings);
      return;
    }

    const recipeIdForServings = deriveRecipeId(activeSelectedDish, item);
    if (!recipeIdForServings) return;

    (async () => {
      try {
        const detail = await getRecipeDetails(recipeIdForServings);
        const servings = Math.round(Number(detail?.servings));
        if (!cancelled && Number.isFinite(servings) && servings > 0) {
          setRecipeServings(servings);
        }
      } catch {
        // Keep the 1-serving fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeIsRecipeLike, activeSelectedDish, item]);

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
          externalId: cleanId(comboItem.externalId || comboItem.external_id || comboItem.recipe_id || comboItem.fatsecret_food_id || comboItem.food_id || comboItem.id),
          source: cleanId(comboItem.source) || (isRecipeLikeItem(comboItem) ? "fatsecret_recipe" : "fatsecret_food"),
          servingId: cleanId(comboItem.servingId || comboItem.serving_id),
          servingDescription: cleanId(comboItem.servingDescription || comboItem.serving_description),
          nutrients: comboItem.nutrients && typeof comboItem.nutrients === "object" ? comboItem.nutrients : {},
        };

        const res = await authedFetch(`/api/meals/add`, {
          method: "POST",
          getToken,
          clerkId: userId,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Failed to save meal");
        }
      }

      markMealsSummaryDirty(userId, dateStr);
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

  const food = mergeFoodSnapshot(activeSelectedDish || item, currentDetailItem);
  const primaryImage = displayComboItems[0]?.image || food?.image || item?.image || "";
  const comboServingText = activeIsRecipeLike
    ? formatServingsLabel(recipeServings ?? activeSelectedDish?.servings ?? item?.servings)
    : getFoodServingText(food);
  const recipeId = deriveRecipeId(activeSelectedDish, item);
  const handleViewRecipe = () => {
    if (!recipeId) {
      showAlert("Recipe", "Recipe details are unavailable for this item.");
      return;
    }

    router.push({
      pathname: "/(tabs)/meal/recipedetail",
      params: {
        id: recipeId,
        source: "fatsecret",
        previewImage: activeSelectedDish?.image || item?.image || "",
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 py-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="black" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-xl font-bold text-gray-500">Food detail</Text>
        <View className="w-7" />
      </View>

      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-start mb-6" style={{ gap: 16 }}>
          <View className="flex-1" style={{ gap: 14, paddingTop: 2 }}>
            <Text className="text-2xl font-extrabold text-gray-900" style={{ letterSpacing: -0.4 }}>
              {item?.title || food?.title}
            </Text>
            <View style={{ gap: 9 }}>
              <View className="flex-row items-center self-start bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm">
                <Ionicons name="flame" size={19} color="#FF9500" />
                <Text className="font-bold ml-2 text-base">{Math.round(Number(totalCalories))} kcal</Text>
              </View>
              <View className="flex-row items-center self-start bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm">
                <Ionicons name="restaurant-outline" size={17} color="#6B7280" />
                <Text className="font-bold ml-2 text-sm text-gray-900">{comboServingText}</Text>
              </View>
            </View>
          </View>
          <View
            className="rounded-3xl overflow-hidden bg-gray-100 items-center justify-center"
            style={{ width: 138, height: 172 }}
          >
            {primaryImage ? (
              <Image source={{ uri: primaryImage }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <IngredientIcon ingredientName={food?.title} size={60} />
            )}
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

        {loadingNutrition ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="large" color="#007AFF" />
            <Text className="text-gray-500 mt-2">Loading nutrition facts...</Text>
          </View>
        ) : (
          <FoodFactsCard item={food} nutritionFacts={nutritionFacts} />
        )}

        {activeIsRecipeLike && (
          <TouchableOpacity
            onPress={handleViewRecipe}
            className="w-full py-4 bg-primary rounded-2xl mb-3 shadow-md flex-row justify-center items-center"
          >
            <Ionicons name="book-outline" size={24} color="white" />
            <Text className="text-white text-center font-bold text-lg ml-2">View Recipe</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={handleAddToLog}
          disabled={adding}
          className={`w-full py-4 rounded-2xl mb-10 flex-row justify-center items-center ${
            activeIsRecipeLike ? "bg-white border-2 border-primary" : "bg-primary shadow-md"
          }`}
        >
          {adding ? (
            <ActivityIndicator color={activeIsRecipeLike ? "#007BFF" : "white"} />
          ) : (
            <>
              <Ionicons name="add-circle" size={24} color={activeIsRecipeLike ? "#007BFF" : "white"} />
              <Text
                className={`text-center font-bold text-lg ml-2 ${
                  activeIsRecipeLike ? "text-primary" : "text-white"
                }`}
              >
                Add to Meal Plan
              </Text>
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
