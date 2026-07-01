import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect } from "@react-navigation/native";

import AddFoodModal from "../../../components/addfoodmodal";
import CustomAlert from "../../../components/customAlert";
import FatSecretInfoModal from "../../../components/FatSecretInfoModal";
import Food3DIcon from "../../../components/Food3DIcon";
import InfoButton from "../../../components/InforButton";
import MostConsumedFoodsStrip from "../../../components/MostConsumedFoodsStrip";
import RecentMealsModal from "../../../components/RecentMealModal";
import SuccessModal from "../../../components/sucessmodal";
import {
  addMealsBatch,
  fetchMealPlanPreferences,
  fetchMealPlanRecommendations,
  fetchMostConsumedFromMealLogs,
  saveMealPlanPreferences,
  sendMealPlanEvent,
} from "../../../services/planning.network";
import type { MealPlanPreferences } from "../../../services/planning.network";
import {
  createEmptyItemsByMeal,
  formatLocalYYYYMMDD,
  MEAL_TYPES,
} from "../../../services/planning.types";
import type { ItemsByMeal, MealType } from "../../../services/planning.types";
import {
  fetchMealsSummaryWithCache,
  markMealsSummaryDirty,
} from "../../../services/mealsSummaryStore";
import { markFavoritesDirty } from "../../../services/favoritesStore";
import { authedFetch } from "../../../services/authedFetch";

const ALLERGEN_OPTIONS = [
  "Egg",
  "Fish",
  "Gluten",
  "Lactose",
  "Milk",
  "Nuts",
  "Peanuts",
  "Sesame",
  "Shellfish",
  "Soy",
];

const DIET_DETAILS = [
  {
    value: "Vegan",
    description: "No animal products",
    icon: "leaf-outline",
    iconColor: "#16A34A",
    iconBgClass: "bg-green-50",
  },
  {
    value: "Vegetarian",
    description: "No meat or fish",
    icon: "nutrition-outline",
    iconColor: "#007BFF",
    iconBgClass: "bg-primarySoft",
  },
];

const NUTRIENT_OPTIONS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg" },
];

const emptyPreferences = (): MealPlanPreferences => ({
  allergens: [],
  diets: [],
  nutrientLimits: {},
});

const clonePreferences = (preferences: MealPlanPreferences): MealPlanPreferences => ({
  allergens: [...(preferences.allergens || [])],
  diets: [...(preferences.diets || [])],
  nutrientLimits: JSON.parse(JSON.stringify(preferences.nutrientLimits || {})),
});

const getActiveFilterCount = (preferences: MealPlanPreferences) =>
  (preferences.allergens || []).length +
  (preferences.diets || []).length +
  Object.keys(preferences.nutrientLimits || {}).length;

const formatNutrientChip = (key: string, value: { min?: number; max?: number }) => {
  const option = NUTRIENT_OPTIONS.find((item) => item.key === key);
  const label = option?.label || key;
  const unit = option?.unit || "";
  if (value.min !== undefined && value.max !== undefined) return `${label} ${value.min}-${value.max}${unit}`;
  if (value.min !== undefined) return `${label} >= ${value.min}${unit}`;
  if (value.max !== undefined) return `${label} <= ${value.max}${unit}`;
  return label;
};

const createItemKey = (item: any) =>
  String(item?.fatsecret_food_id || item?.food_id || item?.recipe_id || item?.id || item?.title || "")
    .trim()
    .toLowerCase();

const getExternalId = (item: any) =>
  String(item?.fatsecret_food_id || item?.food_id || item?.recipe_id || item?.id || "").trim();

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const shuffleItems = (items: any[], seed = Date.now()) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.abs(Math.sin(seed + index) * 10000)) % (index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const buildNutrientsSnapshot = (item: any) => ({
  calories: toNumber(item?.calories),
  protein: toNumber(item?.protein),
  carbs: toNumber(item?.carbs),
  fat: toNumber(item?.fats ?? item?.fat),
  fiber: toNumber(item?.fiber),
  sugar: toNumber(item?.sugar),
  sodium: toNumber(item?.sodium),
  cholesterol: toNumber(item?.cholesterol),
  per100: item?.per100 || {},
});

const DishCard = ({
  item,
  isSelected,
  onPress,
  onToggleSelect,
  onSkip,
  onLove,
  isAdding = false,
  isFavorite = false,
  isFavoriteLoading = false,
}: {
  item: any;
  isSelected: boolean;
  onPress: () => void;
  onToggleSelect: () => void;
  onSkip: () => void;
  onLove: () => void;
  isAdding?: boolean;
  isFavorite?: boolean;
  isFavoriteLoading?: boolean;
}) => {
  const image = typeof item?.image === "string" ? item.image.trim() : "";
  const isRecipeItem =
    String(item?.source || "").toLowerCase().includes("recipe") ||
    String(item?.type || "").toLowerCase().includes("recipe") ||
    !!String(item?.recipe_id || "").trim() ||
    String(item?.id || "").trim().toLowerCase().startsWith("recipe-");
  const sourceLabel = item?.source === "fatsecret_recipe" ? "Recipe" : item?.food_type || "Food";
  const servingCount = Math.max(1, Math.round(toNumber(item?.servings, 1)));
  const servingText = isRecipeItem
    ? `${servingCount} serving${servingCount > 1 ? "s" : ""}`
    : `${Math.round(toNumber(item?.grams || item?.metric_serving_amount || 100))} g`;

  return (
    <View className={`mb-4 rounded-3xl border overflow-hidden bg-white shadow-sm ${isSelected ? "border-primary" : "border-gray-100"}`}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        <View className="h-44 bg-gray-100">
          {image ? (
            <Image source={{ uri: image }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <Food3DIcon name={item?.title} size={54} />
            </View>
          )}
          <View className="absolute top-3 right-3 rounded-full bg-white/95 px-3 py-1">
            <Text className="text-xs font-bold text-gray-700">{sourceLabel}</Text>
          </View>
        </View>

        <View className="p-4">
          <Text className="text-lg font-bold text-black mb-1" numberOfLines={2}>
            {item?.title || "Unknown dish"}
          </Text>
          <View className="flex-row items-center mb-3">
            <Ionicons name="flame-outline" size={15} color="#6B7280" />
            <Text className="text-gray-600 text-xs ml-1 mr-3">{Math.round(toNumber(item?.calories))} kcal</Text>
            <Ionicons name={isRecipeItem ? "restaurant-outline" : "scale-outline"} size={15} color="#6B7280" />
            <Text className="text-gray-600 text-xs ml-1">{servingText}</Text>
          </View>
          <View className="flex-row gap-2 flex-wrap">
            <View className="bg-orange-50 px-2 py-1 rounded-full">
              <Text className="text-[11px] text-orange-700 font-semibold">Fat {toNumber(item?.fats).toFixed(1)}g</Text>
            </View>
            <View className="bg-blue-50 px-2 py-1 rounded-full">
              <Text className="text-[11px] text-blue-700 font-semibold">Protein {toNumber(item?.protein).toFixed(1)}g</Text>
            </View>
            <View className="bg-green-50 px-2 py-1 rounded-full">
              <Text className="text-[11px] text-green-700 font-semibold">Carbs {toNumber(item?.carbs).toFixed(1)}g</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <View className="px-4 pb-4">
        <View className="border-t border-gray-100 pt-3 flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <TouchableOpacity onPress={onLove} disabled={isFavoriteLoading} className="p-2">
              {isFavoriteLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={24} color={isFavorite ? "#EF4444" : "#A0AEC0"} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onSkip} className="p-2">
              <Ionicons name="close-circle-outline" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={onToggleSelect}
            disabled={isAdding}
            className={`flex-row items-center px-4 py-2 rounded-full border ${isSelected ? "bg-primary border-primary" : "bg-gray-50 border-gray-200"}`}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color={isSelected ? "white" : "#007BFF"} />
            ) : (
              <Ionicons name={isSelected ? "checkmark-circle" : "add-circle-outline"} size={18} color={isSelected ? "white" : "#007BFF"} />
            )}
            <Text className={`font-bold ml-2 ${isSelected ? "text-white" : "text-primary"}`}>Pick</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const PlanningScreen = () => {
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const configuredApiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
  const isMountedRef = useRef(true);
  const addRequestInFlightRef = useRef(false);
  const prewarmRequestKeyRef = useRef("");
  const shuffleSeedRef = useRef(0);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMealType, setSelectedMealType] = useState<MealType>("breakfast");
  const [itemsByMeal, setItemsByMeal] = useState<ItemsByMeal>(createEmptyItemsByMeal());
  const [mostConsumedItems, setMostConsumedItems] = useState<any[]>([]);
  const [preferences, setPreferences] = useState<MealPlanPreferences>(emptyPreferences);
  const [draftPreferences, setDraftPreferences] = useState<MealPlanPreferences>(emptyPreferences);
  const [hasPlanStarted, setHasPlanStarted] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(2000);
  const [consumedCalories, setConsumedCalories] = useState(0);
  const [selectedItemKeys, setSelectedItemKeys] = useState<Record<string, any>>({});

  const [isRefineVisible, setIsRefineVisible] = useState(false);
  const [refineStep, setRefineStep] = useState(0);
  const [isAddMenuVisible, setIsAddMenuVisible] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRecentModalVisible, setIsRecentModalVisible] = useState(false);
  const [isRecommendationInfoVisible, setIsRecommendationInfoVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pickingItemKey, setPickingItemKey] = useState<string | null>(null);
  const [favoriteItemKeys, setFavoriteItemKeys] = useState<Record<string, boolean>>({});
  const [favoriteExternalIds, setFavoriteExternalIds] = useState<Set<string>>(() => new Set());
  const [favoriteLoadingKey, setFavoriteLoadingKey] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    confirmText: "OK",
    variant: "default" as "default" | "success",
    onConfirm: () => setAlertVisible(false),
  });

  const displayedItems = itemsByMeal[selectedMealType] || [];
  const selectedItems = useMemo(() => Object.values(selectedItemKeys), [selectedItemKeys]);
  const activeFilterCount = getActiveFilterCount(preferences);
  const refineStepSelectionCount =
    refineStep === 0
      ? draftPreferences.allergens.length
      : refineStep === 1
        ? draftPreferences.diets.length
        : Object.keys(draftPreferences.nutrientLimits || {}).length;
  const hasAnyRecommendations = MEAL_TYPES.some((mealType) => (itemsByMeal[mealType] || []).length > 0);
  const progressRatio = dailyCalorieTarget > 0 ? Math.min(1, consumedCalories / dailyCalorieTarget) : 0;

  const showCustomAlert = useCallback((
    title: string,
    message: string,
    onConfirm?: () => void,
    options: { confirmText?: string; variant?: "default" | "success" } = {}
  ) => {
    setAlertConfig({
      title,
      message,
      confirmText: options.confirmText || "OK",
      variant: options.variant || "default",
      onConfirm: onConfirm || (() => setAlertVisible(false)),
    });
    setAlertVisible(true);
  }, []);

  const refreshDailyProgress = useCallback(async () => {
    if (!userId || !configuredApiURL) return;
    try {
      const dateKey = formatLocalYYYYMMDD(selectedDate);
      const meals = await fetchMealsSummaryWithCache({
        apiURL: configuredApiURL,
        userId,
        date: dateKey,
        getToken,
      });
      const total = (meals || []).reduce((sum: number, item: any) => sum + Number(item?.calories || 0), 0);
      if (isMountedRef.current) setConsumedCalories(Math.round(total));
    } catch {
      // Keep the previous progress if the summary refresh fails.
    }
  }, [configuredApiURL, selectedDate, userId]);

  const loadMostConsumed = useCallback(async () => {
    if (!userId || !configuredApiURL) return;
    const items = await fetchMostConsumedFromMealLogs({
      apiURL: configuredApiURL,
      clerkId: userId,
      limit: 10,
      getToken,
    });
    if (isMountedRef.current) setMostConsumedItems(items);
  }, [configuredApiURL, userId]);

  const loadFavoriteStatuses = useCallback(async () => {
    if (!userId || !configuredApiURL) return;
    try {
      const response = await authedFetch(`/api/favorites/list/${encodeURIComponent(userId)}`, {
        getToken,
        clerkId: userId,
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({}));
      const favorites = Array.isArray(payload?.favoriteFoods) ? payload.favoriteFoods : [];
      const ids = new Set<string>();
      favorites.forEach((favorite: any) => {
        const externalId = String(favorite?.externalId || favorite?.external_id || "").trim();
        if (externalId) ids.add(externalId);
      });
      if (isMountedRef.current) setFavoriteExternalIds(ids);
    } catch {
      // Favorite state is cosmetic here; keep the cards usable if this refresh fails.
    }
  }, [configuredApiURL, userId]);

  const applyRecommendationPayload = useCallback((payload: any, mealScope: MealType | "all" = "all") => {
    const nextByMeal = {
      breakfast: (payload?.recommendationsByMeal?.breakfast || []).slice(0, 8),
      lunch: (payload?.recommendationsByMeal?.lunch || []).slice(0, 8),
      dinner: (payload?.recommendationsByMeal?.dinner || []).slice(0, 8),
    };

    setItemsByMeal((previous) =>
      mealScope === "all"
        ? nextByMeal
        : {
            ...previous,
            [mealScope]: nextByMeal[mealScope],
          }
    );

    if (Array.isArray(payload?.most_consumed_items) && payload.most_consumed_items.length > 0) {
      setMostConsumedItems(payload.most_consumed_items.slice(0, 10));
    }
    setDailyCalorieTarget(Math.max(1200, Number(payload?.daily_calorie_target || 2000)));
  }, []);

  const loadRecommendations = useCallback(
    async ({
      forceExploration = false,
      mealType = "all",
      explorationSeed,
      preferencesOverride,
    }: {
      forceExploration?: boolean;
      mealType?: MealType | "all";
      explorationSeed?: string | number;
      preferencesOverride?: MealPlanPreferences;
    } = {}) => {
      if (!userId || !configuredApiURL) return;
      setLoadingRecommendations(true);
      try {
        const payload = await fetchMealPlanRecommendations({
          apiURL: configuredApiURL,
          clerkId: userId,
          getToken,
          date: formatLocalYYYYMMDD(selectedDate),
          mealType: mealType === "all" ? undefined : mealType,
          forceExploration,
          explorationSeed,
          preferences: preferencesOverride,
        });
        if (!isMountedRef.current) return;
        applyRecommendationPayload(payload, mealType);
        setHasPlanStarted(true);
      } catch {
        if (isMountedRef.current) {
          showCustomAlert("Meal Plan", "We could not refresh meal ideas right now. Please try again.");
        }
      } finally {
        if (isMountedRef.current) setLoadingRecommendations(false);
      }
    },
    [applyRecommendationPayload, configuredApiURL, selectedDate, showCustomAlert, userId]
  );

  const prewarmDraftRecommendations = useCallback(
    (nextPreferences: MealPlanPreferences) => {
      if (!userId || !configuredApiURL) return;
      const date = formatLocalYYYYMMDD(selectedDate);
      const requestKey = JSON.stringify({ userId, date, preferences: nextPreferences });
      if (prewarmRequestKeyRef.current === requestKey) return;
      prewarmRequestKeyRef.current = requestKey;

      void fetchMealPlanRecommendations({
        apiURL: configuredApiURL,
        clerkId: userId,
        getToken,
        date,
        preferences: nextPreferences,
      }).catch(() => {
        prewarmRequestKeyRef.current = "";
      });
    },
    [configuredApiURL, selectedDate, userId]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      if (!userId || !configuredApiURL) {
        setLoadingPreferences(false);
        return;
      }
      try {
        const [preferencesPayload] = await Promise.all([
          fetchMealPlanPreferences({ apiURL: configuredApiURL, clerkId: userId, getToken }),
          loadMostConsumed(),
        ]);
        if (!isMountedRef.current) return;
        const savedPreferences = preferencesPayload?.preferences || emptyPreferences();
        setPreferences(clonePreferences(savedPreferences));
        setDraftPreferences(clonePreferences(savedPreferences));

        if (getActiveFilterCount(savedPreferences) > 0) {
          setHasPlanStarted(true);
          void loadRecommendations({ mealType: "all" });
        }
      } catch {
        if (isMountedRef.current) {
          showCustomAlert("Meal Plan", "We could not load your saved meal plan settings.");
        }
      } finally {
        if (isMountedRef.current) setLoadingPreferences(false);
      }
    })();
  }, [configuredApiURL, loadMostConsumed, loadRecommendations, showCustomAlert, userId]);

  useFocusEffect(
    useCallback(() => {
      refreshDailyProgress();
      void loadFavoriteStatuses();
    }, [loadFavoriteStatuses, refreshDailyProgress])
  );

  useEffect(() => {
    if (hasPlanStarted && hasAnyRecommendations) {
      void refreshDailyProgress();
    }
  }, [hasPlanStarted, hasAnyRecommendations, refreshDailyProgress]);

  const openRefine = () => {
    setDraftPreferences(clonePreferences(preferences));
    setRefineStep(0);
    setIsRefineVisible(true);
  };

  const toggleDraftAllergen = (allergen: string) => {
    setDraftPreferences((current) => {
      const exists = current.allergens.includes(allergen);
      return {
        ...current,
        allergens: exists
          ? current.allergens.filter((item) => item !== allergen)
          : [...current.allergens, allergen],
      };
    });
  };

  const toggleDraftDiet = (diet: string) => {
    setDraftPreferences((current) => ({
      ...current,
      diets: current.diets.includes(diet) ? [] : [diet],
    }));
  };

  const updateDraftNutrient = (key: string, side: "min" | "max", value: string) => {
    setDraftPreferences((current) => {
      const nextLimits = { ...(current.nutrientLimits || {}) };
      const nextValue = { ...(nextLimits[key] || {}) };
      const parsed = value.trim() === "" ? undefined : Number(value);

      if (parsed === undefined || !Number.isFinite(parsed)) {
        delete nextValue[side];
      } else {
        nextValue[side] = Math.max(0, parsed);
      }

      if (nextValue.min === undefined && nextValue.max === undefined) {
        delete nextLimits[key];
      } else {
        nextLimits[key] = nextValue;
      }

      return {
        ...current,
        nutrientLimits: nextLimits,
      };
    });
  };

  const applyRefinePlan = async () => {
    if (!userId || !configuredApiURL) return;
    try {
      const payload = await saveMealPlanPreferences({
        apiURL: configuredApiURL,
        clerkId: userId,
        getToken,
        preferences: draftPreferences,
      });
      const savedPreferences = payload?.preferences || draftPreferences;
      setPreferences(clonePreferences(savedPreferences));
      setIsRefineVisible(false);
      setSelectedItemKeys({});
      setHasPlanStarted(true);
      await loadRecommendations({ mealType: "all", preferencesOverride: savedPreferences });
    } catch {
      showCustomAlert("Meal Plan", "We could not save your meal plan settings.");
    }
  };

  const handleUseDefaults = async () => {
    if (!userId || !configuredApiURL) return;
    const defaults = emptyPreferences();
    try {
      await saveMealPlanPreferences({
        apiURL: configuredApiURL,
        clerkId: userId,
        getToken,
        preferences: defaults,
      });
      setPreferences(defaults);
      setDraftPreferences(defaults);
    } catch {
      // Defaults can still be used locally even if persistence fails.
    }
    setHasPlanStarted(true);
    await loadRecommendations({ forceExploration: true, mealType: "all" });
  };

  const handleSelectMealType = (mealType: MealType) => {
    setSelectedMealType(mealType);
    if (hasPlanStarted && (itemsByMeal[mealType] || []).length === 0 && !loadingRecommendations) {
      void loadRecommendations({ mealType });
    }
  };

  const handleShuffle = async () => {
    const seed = Date.now() + shuffleSeedRef.current + 1;
    shuffleSeedRef.current += 1;
    setSelectedItemKeys({});
    setItemsByMeal((current) => ({
      ...current,
      [selectedMealType]: shuffleItems(current[selectedMealType] || [], seed),
    }));

    if (configuredApiURL && userId && displayedItems.length > 0) {
      void sendMealPlanEvent({
        apiURL: configuredApiURL,
        clerkId: userId,
        getToken,
        eventType: "shuffled",
        mealType: selectedMealType,
        items: displayedItems,
        preferences,
      });
    }
    await loadRecommendations({ forceExploration: true, mealType: selectedMealType, explorationSeed: seed });
  };

  const handleSkipItem = (item: any, index: number) => {
    const key = createItemKey(item);
    setItemsByMeal((current) => ({
      ...current,
      [selectedMealType]: current[selectedMealType].filter((_item, itemIndex) => itemIndex !== index),
    }));
    setSelectedItemKeys((current) => {
      if (!key || !current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    void sendMealPlanEvent({
      apiURL: configuredApiURL,
      clerkId: userId,
      getToken,
      eventType: "skipped",
      mealType: selectedMealType,
      item,
      preferences,
    });
  };

  const handleLoveItem = async (item: any) => {
    if (!userId || !configuredApiURL) {
      showCustomAlert("Error", "You must be logged in to save favorites.");
      return;
    }

    const key = createItemKey(item);
    if (!key || favoriteLoadingKey === key) return;

    setFavoriteLoadingKey(key);
    try {
      const response = await authedFetch(`/api/favorites/toggle`, {
        method: "POST",
        getToken,
        clerkId: userId,
        body: JSON.stringify({
          clerkId: userId,
          item: {
            id: getExternalId(item),
            externalId: getExternalId(item),
            title: item.title || item.food_name || "Unknown dish",
            image: item.image || "",
            calories: toNumber(item.calories),
            protein: toNumber(item.protein),
            carbs: toNumber(item.carbs),
            fats: toNumber(item.fats),
            grams: toNumber(item.grams || item.metric_serving_amount || 100),
            time: item.time || "",
            servings: item.servings || 1,
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Could not update favorite");

      setFavoriteItemKeys((current) => ({
        ...current,
        [key]: !!payload?.isFavorite,
      }));
      const externalId = getExternalId(item);
      if (externalId) {
        setFavoriteExternalIds((current) => {
          const next = new Set(current);
          if (payload?.isFavorite) {
            next.add(externalId);
          } else {
            next.delete(externalId);
          }
          return next;
        });
      }
      markFavoritesDirty(userId);

      if (payload?.isFavorite) {
        showCustomAlert("Success!", "Dish saved to your favorite foods.", undefined, {
          confirmText: "Confirm",
          variant: "success",
        });
      } else {
        showCustomAlert("Favorites", "Dish removed from your favorite foods.");
      }
    } catch {
      showCustomAlert("Error", "Could not update this favorite food.");
    } finally {
      setFavoriteLoadingKey(null);
    }
  };

  const goToDetail = (item: any) => {
    router.push({
      pathname: "/(tabs)/meal/comboDetail",
      params: {
        itemData: JSON.stringify(item),
        selectedDate: formatLocalYYYYMMDD(selectedDate),
      },
    });
  };

  const isFavoriteItem = useCallback((item: any) => {
    const key = createItemKey(item);
    if (key && Object.prototype.hasOwnProperty.call(favoriteItemKeys, key)) {
      return !!favoriteItemKeys[key];
    }
    const externalId = getExternalId(item);
    return !!externalId && favoriteExternalIds.has(externalId);
  }, [favoriteExternalIds, favoriteItemKeys]);

  const showMealLogOutcome = (payload: any) => {
    if (payload?.exceededLimit) {
      showCustomAlert("Calorie Target Exceeded", "Food added, but you crossed your daily calorie goal.");
    } else if (payload?.reachedTarget) {
      showCustomAlert("Calorie Target Reached", "Great job! You reached your daily calorie target.");
    } else {
      setShowSuccessModal(true);
    }
  };

  const handlePickItem = async (item: any) => {
    if (!userId || !configuredApiURL || addRequestInFlightRef.current) return;
    const itemKey = createItemKey(item);
    addRequestInFlightRef.current = true;
    setPickingItemKey(itemKey || null);

    try {
      const date = formatLocalYYYYMMDD(selectedDate);
      const payload = await addMealsBatch([
        {
          apiURL: configuredApiURL,
          getToken,
          clerkId: userId,
          date,
          mealType: selectedMealType,
          foodName: item.title || item.food_name || "Unknown Item",
          calories: toNumber(item.calories),
          protein: toNumber(item.protein),
          carbs: toNumber(item.carbs),
          fats: toNumber(item.fats),
          image: item.image || "",
          externalId: getExternalId(item),
          source: item.source || item.type || "",
          servingId: item.serving_id || "",
          servingDescription: item.serving_description || "",
          nutrients: buildNutrientsSnapshot(item),
        },
      ]);

      markMealsSummaryDirty(userId, date);
      setConsumedCalories(Math.round(Number(payload?.dailyTotalCalories || consumedCalories)));
      setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      setSelectedItemKeys({});
      void sendMealPlanEvent({
        apiURL: configuredApiURL,
        clerkId: userId,
        getToken,
        eventType: "accepted",
        mealType: selectedMealType,
        item,
        preferences,
      });
      showMealLogOutcome(payload);
    } catch {
      showCustomAlert("Error", "Failed to add this dish.");
    } finally {
      addRequestInFlightRef.current = false;
      setPickingItemKey(null);
    }
  };

  const handleAddSelectedItems = async () => {
    if (!userId || !configuredApiURL || selectedItems.length === 0 || addRequestInFlightRef.current) return;
    addRequestInFlightRef.current = true;
    try {
      const date = formatLocalYYYYMMDD(selectedDate);
      const payload = await addMealsBatch(
        selectedItems.map((item: any) => ({
          apiURL: configuredApiURL,
          getToken,
          clerkId: userId,
          date,
          mealType: selectedMealType,
          foodName: item.title || item.food_name || "Unknown Item",
          calories: toNumber(item.calories),
          protein: toNumber(item.protein),
          carbs: toNumber(item.carbs),
          fats: toNumber(item.fats),
          image: item.image || "",
          externalId: getExternalId(item),
          source: item.source || item.type || "",
          servingId: item.serving_id || "",
          servingDescription: item.serving_description || "",
          nutrients: buildNutrientsSnapshot(item),
        }))
      );

      markMealsSummaryDirty(userId, date);
      setConsumedCalories(Math.round(Number(payload?.dailyTotalCalories || consumedCalories)));
      setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      setSelectedItemKeys({});
      void sendMealPlanEvent({
        apiURL: configuredApiURL,
        clerkId: userId,
        getToken,
        eventType: "accepted",
        mealType: selectedMealType,
        items: selectedItems,
        preferences,
      });
      showMealLogOutcome(payload);
    } catch {
      showCustomAlert("Error", "Failed to add selected dishes.");
    } finally {
      addRequestInFlightRef.current = false;
    }
  };

  const handleAddManualFood = async (foodItem: any) => {
    if (!userId || !configuredApiURL) return;
    try {
      const date = formatLocalYYYYMMDD(selectedDate);
      const response = await authedFetch(`/api/meals/add`, {
        method: "POST",
        getToken,
        clerkId: userId,
        body: JSON.stringify({
          clerkId: userId,
          date,
          mealType: selectedMealType,
          foodName: foodItem.title || foodItem.food_name,
          calories: foodItem.calories,
          protein: foodItem.protein,
          carbs: foodItem.carbs,
          fats: foodItem.fats,
          image: foodItem.image || "",
          externalId: getExternalId(foodItem),
          source: foodItem.source || foodItem.type || "",
          servingId: foodItem.serving_id || "",
          servingDescription: foodItem.serving_description || "",
          nutrients: buildNutrientsSnapshot(foodItem),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Could not save food");
      markMealsSummaryDirty(userId, date);
      setConsumedCalories(Math.round(Number(payload?.dailyTotalCalories || consumedCalories + Number(foodItem?.calories || 0))));
      setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      setIsModalVisible(false);
      showMealLogOutcome(payload);
    } catch {
      showCustomAlert("Error", "Network error while adding custom food.");
    }
  };

  const handleAddRecentMeals = async (mealsToAdd: any[]) => {
    if (!userId || !configuredApiURL || mealsToAdd.length === 0 || addRequestInFlightRef.current) return;
    addRequestInFlightRef.current = true;
    setIsRecentModalVisible(false);
    try {
      const date = formatLocalYYYYMMDD(selectedDate);
      const payload = await addMealsBatch(
        mealsToAdd.map((meal) => ({
          apiURL: configuredApiURL,
          getToken,
          clerkId: userId,
          date,
          mealType: selectedMealType,
          foodName: meal.foodName || "Unknown Item",
          calories: toNumber(meal.calories),
          protein: toNumber(meal.protein),
          carbs: toNumber(meal.carbs),
          fats: toNumber(meal.fats),
          image: meal.image || "",
          externalId: meal.externalId || "",
          source: meal.source || "",
          servingId: meal.servingId || "",
          servingDescription: meal.servingDescription || "",
          nutrients: meal.nutrients || {},
        }))
      );

      markMealsSummaryDirty(userId, date);
      setConsumedCalories(Math.round(Number(payload?.dailyTotalCalories || consumedCalories)));
      setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      showMealLogOutcome(payload);
    } catch {
      showCustomAlert("Error", "Network error while adding recent meals.");
    } finally {
      addRequestInFlightRef.current = false;
    }
  };

  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date;
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: selectedItems.length > 0 ? 116 : 24 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row justify-between items-center py-4 mb-4">
          <TouchableOpacity onPress={() => router.push("/(tabs)/meal")} className="p-2">
            <Ionicons name="chevron-back" size={28} color="black" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-black">Meal Plan</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/meal/summary")} className="p-2">
            <Ionicons name="layers-outline" size={28} color="#007BFF" />
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-between mb-6">
          {dates.map((dateObj, index) => {
            const isSelected = formatLocalYYYYMMDD(dateObj) === formatLocalYYYYMMDD(selectedDate);
            return (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedDate(dateObj)}
                className={`items-center justify-center w-12 h-16 rounded-2xl ${isSelected ? "bg-primary" : "bg-transparent"}`}
              >
                <Text className={`text-xs mb-1 ${isSelected ? "text-white" : "text-gray-400"}`}>
                  {dateObj.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                </Text>
                <Text className={`text-lg font-bold ${isSelected ? "text-white" : "text-gray-600"}`}>{dateObj.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="bg-gray-50 rounded-2xl p-4 mb-5 border border-gray-200">
          <Text className="text-gray-700 font-bold mb-2">Calorie target: {consumedCalories}/{dailyCalorieTarget} kcal</Text>
          <View className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <View style={{ width: `${Math.round(progressRatio * 100)}%` }} className="h-2 bg-primary rounded-full" />
          </View>
        </View>

        {hasPlanStarted && (
          <View className="mb-5">
            <TouchableOpacity onPress={openRefine} className="self-start flex-row items-center bg-primarySoft px-3 py-2 rounded-full border border-blue-100">
              <Ionicons name="options-outline" size={16} color="#007BFF" />
              <Text className="text-primary font-bold ml-2">Refine plan</Text>
              {activeFilterCount > 0 && (
                <View className="ml-2 min-w-6 h-6 rounded-full bg-secondary items-center justify-center px-2">
                  <Text className="text-white text-xs font-bold">{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {activeFilterCount > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                {[...preferences.allergens.map((item) => `${item}-free`), ...preferences.diets, ...Object.entries(preferences.nutrientLimits || {}).map(([key, value]) => formatNutrientChip(key, value))].map((chip) => (
                  <View key={chip} className="mr-2 bg-gray-100 px-3 py-2 rounded-full">
                    <Text className="text-xs font-bold text-gray-700">{chip}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-bold text-black">Most consumed foods</Text>
          <TouchableOpacity
            onPress={() => setIsAddMenuVisible(true)}
            className="w-8 h-8 rounded-full bg-primary items-center justify-center shadow-lg"
            style={{
              shadowColor: "#007BFF",
              shadowOpacity: 0.28,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 5,
            }}
          >
            <Ionicons name="add" size={28} color="white" />
          </TouchableOpacity>
        </View>

        <MostConsumedFoodsStrip items={mostConsumedItems} onPressItem={goToDetail} />

        {!hasPlanStarted && !hasAnyRecommendations ? (
          <View className="mt-10 mb-8">
            <Text className="text-2xl font-bold text-gray-900 mb-2">Build your meal plan</Text>
            <Text className="text-gray-500 leading-6 mb-5">
              Tell us about your allergies, diet, and nutrient targets. We will suggest dishes for each meal.
            </Text>
            <TouchableOpacity onPress={openRefine} className="bg-primary py-4 rounded-2xl items-center mb-3">
              <Text className="text-white font-bold text-base">Refine plan</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleUseDefaults} className="py-3 items-center">
              <Text className="text-primary font-bold">or skip and use defaults</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="flex-row justify-between items-center mb-5">
              <View className="flex-row items-center">
                <Text className="text-xl font-bold">Recommended</Text>
                <InfoButton onPress={() => setIsRecommendationInfoVisible(true)} />
              </View>
              {loadingRecommendations && <ActivityIndicator size="small" color="#007BFF" />}
            </View>

            <View className="flex-row justify-between mb-5">
              {MEAL_TYPES.map((mealType) => {
                const isSelected = selectedMealType === mealType;
                const count = (itemsByMeal[mealType] || []).length;
                return (
                  <TouchableOpacity
                    key={mealType}
                    onPress={() => handleSelectMealType(mealType)}
                    className={`flex-1 py-3 rounded-xl mr-2 items-center ${isSelected ? "bg-secondary" : "bg-gray-50"}`}
                  >
                    <Text className={`font-bold capitalize ${isSelected ? "text-white" : "text-gray-900"}`}>{mealType}</Text>
                    {count > 0 && <Text className={`text-[11px] mt-1 ${isSelected ? "text-white" : "text-gray-400"}`}>{count} dishes</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold capitalize">
                {selectedMealType}
                {selectedItems.length > 0 ? ` ${selectedItems.length} picked` : ""}
              </Text>
              <TouchableOpacity onPress={handleShuffle} className="px-3 py-2 rounded-full bg-blue-50 border border-blue-200">
                <Text className="text-primary font-bold">Shuffle</Text>
              </TouchableOpacity>
            </View>

            {loadingRecommendations && displayedItems.length === 0 ? (
              <View className="py-10 items-center">
                <ActivityIndicator size="large" color="#007BFF" />
                <Text className="text-gray-500 mt-3">Finding meal ideas...</Text>
              </View>
            ) : (
              displayedItems.map((item, index) => {
                const key = createItemKey(item);
                return (
                  <DishCard
                    key={`${key}-${index}`}
                    item={item}
                    isSelected={!!selectedItemKeys[key]}
                    isFavorite={isFavoriteItem(item)}
                    isFavoriteLoading={favoriteLoadingKey === key}
                    onPress={() => goToDetail(item)}
                    onToggleSelect={() => handlePickItem(item)}
                    onSkip={() => handleSkipItem(item, index)}
                    onLove={() => handleLoveItem(item)}
                    isAdding={pickingItemKey === key}
                  />
                );
              })
            )}

            {!loadingRecommendations && displayedItems.length === 0 && (
              <Text className="text-center text-gray-400 mt-10 mb-10">No recommendations available.</Text>
            )}
          </>
        )}
      </ScrollView>

      {selectedItems.length > 0 && (
        <View className="absolute left-0 right-0 bottom-0 bg-white border-t border-gray-100 px-5 pt-3 pb-6">
          <TouchableOpacity onPress={handleAddSelectedItems} className="bg-primary py-4 rounded-2xl items-center">
            <Text className="text-white font-bold text-base">Add {selectedItems.length} to meal log</Text>
          </TouchableOpacity>
          <Text className="text-center text-gray-400 text-xs mt-2">You can edit each in the log</Text>
        </View>
      )}

      <Modal transparent visible={isAddMenuVisible} animationType="fade" onRequestClose={() => setIsAddMenuVisible(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl p-5 pb-8">
            <TouchableOpacity
              onPress={() => {
                setIsAddMenuVisible(false);
                setIsModalVisible(true);
              }}
              className="flex-row items-center py-4 border-b border-gray-100"
            >
              <View className="w-12 h-12 rounded-xl bg-primarySoft items-center justify-center">
                <Ionicons name="add-circle-outline" size={24} color="#007BFF" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-bold text-gray-900 text-lg">Add custom food</Text>
                <Text className="text-gray-500 text-xs mt-1">Enter your own item with macros</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setIsAddMenuVisible(false);
                setIsRecentModalVisible(true);
              }}
              className="flex-row items-center py-4 border-b border-gray-100"
            >
              <View className="w-12 h-12 rounded-xl bg-primarySoft items-center justify-center">
                <Ionicons name="time-outline" size={24} color="#007BFF" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="font-bold text-gray-900 text-lg">From recent meals</Text>
                <Text className="text-gray-500 text-xs mt-1">Re-log something you have had before</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsAddMenuVisible(false)} className="py-4 items-center">
              <Text className="text-gray-400 font-bold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={isRefineVisible} animationType="slide" onRequestClose={() => setIsRefineVisible(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-[28px] overflow-hidden" style={{ height: "88%" }}>
            <View className="items-center pt-2">
              <View className="w-10 h-1 rounded-full bg-gray-300" />
            </View>

            <View className="px-4 pt-5 pb-3">
              <View className="flex-row justify-between items-center mb-5">
                <View className="flex-row items-center">
                  {refineStep > 0 && (
                    <TouchableOpacity
                      onPress={() => setRefineStep((step) => Math.max(0, step - 1))}
                      className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center mr-3"
                    >
                      <Ionicons name="chevron-back" size={20} color="#0F172A" />
                    </TouchableOpacity>
                  )}
                  <View className="flex-row items-center">
                    {[0, 1, 2].map((step) => (
                      <View
                        key={step}
                        className={`mr-1.5 rounded-full ${step <= refineStep ? "bg-primary" : "bg-gray-200"}`}
                        style={{ width: step === refineStep ? 22 : 6, height: 6 }}
                      />
                    ))}
                  </View>
                </View>
                <TouchableOpacity onPress={() => setIsRefineVisible(false)} className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center">
                  <Ionicons name="close" size={22} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <Text className="text-xs text-secondary font-bold mb-2">STEP {refineStep + 1} OF 3</Text>
              <Text className="text-2xl font-bold text-gray-950">
                {refineStep === 0 ? "Any allergies?" : refineStep === 1 ? "Diet preference" : "Nutrient limits"}
              </Text>
              <Text className="text-gray-500 mt-2 leading-5">
                {refineStep === 0
                  ? "We'll exclude any food containing these from your plan."
                  : refineStep === 1
                    ? "Pick one if it matches how you eat. You can change this any time."
                    : "Choose minimum and maximum values for a nutrient per serving. For individual foods, values default to a 100 g serving."}
              </Text>
            </View>

            <ScrollView
              className="px-4 flex-1"
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {refineStep === 0 && (
                <View className="flex-row flex-wrap justify-between pt-1">
                  {ALLERGEN_OPTIONS.map((allergen) => {
                    const selected = draftPreferences.allergens.includes(allergen);
                    return (
                      <TouchableOpacity
                        key={allergen}
                        onPress={() => toggleDraftAllergen(allergen)}
                        className={`mb-2.5 rounded-2xl border px-2.5 py-2.5 flex-row items-center justify-between ${selected ? "bg-blue-50 border-primary" : "bg-gray-50 border-gray-100"}`}
                        style={{ width: "48%" }}
                      >
                        <View className="flex-row items-center flex-1">
                          <View className={`w-6 h-6 rounded-full border items-center justify-center mr-2 ${selected ? "bg-primary border-primary" : "bg-white border-gray-300"}`}>
                            {selected && <Ionicons name="checkmark" size={15} color="white" />}
                          </View>
                          <Text className={`font-bold text-sm flex-1 ${selected ? "text-primary" : "text-slate-700"}`} numberOfLines={1}>
                            {allergen}-free
                          </Text>
                        </View>
                        <Ionicons name="information-circle-outline" size={15} color="#94A3B8" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {refineStep === 1 && (
                <View className="pt-2">
                  {DIET_DETAILS.map((diet) => {
                    const selected = draftPreferences.diets.includes(diet.value);
                    return (
                      <TouchableOpacity
                        key={diet.value}
                        onPress={() => toggleDraftDiet(diet.value)}
                        className={`p-3.5 rounded-2xl border mb-3 flex-row items-center ${selected ? "bg-blue-50 border-primary" : "bg-white border-gray-200"}`}
                      >
                        <View className={`w-12 h-12 rounded-xl items-center justify-center mr-3 ${selected ? "bg-primary" : diet.iconBgClass}`}>
                          <Ionicons name={diet.icon as any} size={23} color={selected ? "white" : diet.iconColor} />
                        </View>
                        <View className="flex-1">
                          <Text className="font-bold text-gray-900 text-base">{diet.value}</Text>
                          <Text className="text-gray-500 text-xs mt-1">{diet.description}</Text>
                        </View>
                        <View className={`w-7 h-7 rounded-full border items-center justify-center ${selected ? "bg-primary border-primary" : "bg-white border-gray-300"}`}>
                          {selected && <Ionicons name="checkmark" size={16} color="white" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    onPress={() => setDraftPreferences((current) => ({ ...current, diets: [] }))}
                    className={`p-3.5 rounded-2xl border mb-3 flex-row items-center ${draftPreferences.diets.length === 0 ? "bg-blue-50 border-primary" : "bg-white border-gray-200"}`}
                    style={draftPreferences.diets.length === 0 ? undefined : { borderStyle: "dashed" }}
                  >
                    <View className={`w-12 h-12 rounded-xl items-center justify-center mr-3 ${draftPreferences.diets.length === 0 ? "bg-primary" : "bg-gray-100"}`}>
                      <Ionicons name="close" size={22} color={draftPreferences.diets.length === 0 ? "white" : "#64748B"} />
                    </View>
                    <View className="flex-1">
                      <Text className={`font-bold text-base ${draftPreferences.diets.length === 0 ? "text-gray-900" : "text-gray-500"}`}>No preference</Text>
                      <Text className="text-gray-500 text-xs mt-1">Show me everything</Text>
                    </View>
                    {draftPreferences.diets.length === 0 && (
                      <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                        <Ionicons name="checkmark" size={16} color="white" />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {refineStep === 2 && (
                <View className="pt-2">
                  {NUTRIENT_OPTIONS.map((nutrient) => {
                    const limit = draftPreferences.nutrientLimits[nutrient.key] || {};
                    return (
                      <View key={nutrient.key} className="mb-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                        <Text className="font-bold text-gray-800 mb-2">{nutrient.label} ({nutrient.unit})</Text>
                        <View className="flex-row gap-3">
                          <View className="flex-1">
                            <Text className="text-[11px] text-gray-400 mb-1">MIN</Text>
                            <TextInput
                              value={limit.min === undefined ? "" : String(limit.min)}
                              onChangeText={(value) => updateDraftNutrient(nutrient.key, "min", value)}
                              keyboardType="numeric"
                              placeholder="No min"
                              className="bg-white border border-gray-200 rounded-xl px-3 py-2"
                            />
                          </View>
                          <View className="flex-1">
                            <Text className="text-[11px] text-gray-400 mb-1">MAX</Text>
                            <TextInput
                              value={limit.max === undefined ? "" : String(limit.max)}
                              onChangeText={(value) => updateDraftNutrient(nutrient.key, "max", value)}
                              keyboardType="numeric"
                              placeholder="No max"
                              className="bg-white border border-gray-200 rounded-xl px-3 py-2"
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View className="border-t border-gray-100 px-4 pt-3 pb-6 flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => {
                  if (refineStep === 0) {
                    setDraftPreferences((current) => ({ ...current, allergens: [] }));
                    return;
                  }
                  setRefineStep((step) => Math.max(0, step - 1));
                }}
                className="w-20 py-4 rounded-2xl bg-gray-100 items-center"
              >
                <Text className="font-bold text-gray-700">{refineStep === 0 ? "None" : "Back"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (refineStep < 2) {
                    prewarmDraftRecommendations(draftPreferences);
                    setRefineStep((step) => step + 1);
                  } else {
                    void applyRefinePlan();
                  }
                }}
                className="flex-1 py-4 rounded-2xl bg-primary items-center justify-center flex-row shadow-md"
                style={{
                  shadowColor: "#007BFF",
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 4,
                }}
              >
                <Text className="font-bold text-white">{refineStep < 2 ? "Continue" : "Apply"}</Text>
                {refineStepSelectionCount > 0 && (
                  <View className="ml-3 min-w-6 h-6 rounded-full bg-white/20 items-center justify-center px-2">
                    <Text className="text-white text-xs font-bold">{refineStepSelectionCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color="white" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {isModalVisible && (
        <AddFoodModal visible={isModalVisible} onClose={() => setIsModalVisible(false)} mealType={selectedMealType} onAddFood={handleAddManualFood} />
      )}

      <FatSecretInfoModal
        visible={isRecommendationInfoVisible}
        title="How it works"
        description="These foods are recommended based on your goal and eating behaviors. Some food images are provided by the FatSecret Platform API."
        note="Note: Food images are symbolic illustrations and may not match the exact dish. Some dishes may also be displayed without images while we improve image coverage."
        onClose={() => setIsRecommendationInfoVisible(false)}
      />

      {isRecentModalVisible && (
        <RecentMealsModal visible={isRecentModalVisible} onClose={() => setIsRecentModalVisible(false)} onAddSelected={handleAddRecentMeals} />
      )}

      {alertVisible && (
        <CustomAlert
          visible={alertVisible}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          variant={alertConfig.variant}
          onConfirm={alertConfig.onConfirm}
          onCancel={undefined}
        />
      )}

      <SuccessModal
        visible={showSuccessModal}
        message="Meal added successfully!"
        onClose={() => setShowSuccessModal(false)}
      />

      {loadingPreferences && (
        <View className="absolute inset-0 bg-white/60 items-center justify-center">
          <ActivityIndicator size="large" color="#007BFF" />
        </View>
      )}
    </SafeAreaView>
  );
};

export default PlanningScreen;
