import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";

import SuccessModal from "../../../components/sucessmodal";
import AddFoodModal from "../../../components/addfoodmodal";
import ComboCard from "../../../components/ComboCard";
import InfoButton from "../../../components/InforButton";
import CustomAlert from "../../../components/customAlert";
import RecentMealsModal from "../../../components/RecentMealModal";
import MostConsumedFoodsStrip from "../../../components/MostConsumedFoodsStrip";
import {
  fetchRecommendations,
  getPrimeRecommendationStatus,
  peekCachedRecommendations,
  primeRecommendations,
  primeRecommendationsDetailed,
  sendRecommendationFeedback,
} from "../../../services/recommendation";
import {
  createEmptyItemsByMeal,
  formatLocalYYYYMMDD,
  LOADING_MESSAGES,
  MEAL_TYPES,
} from "../../../services/planning.types";
import type { ItemsByMeal, MealType } from "../../../services/planning.types";
import { addMealsBatch } from "../../../services/planning.network";

const RecommendationSkeletonList = ({ count = 3 }) => (
  <View className="mt-2 mb-2">
    {Array.from({ length: count }, (_, index) => (
      <View key={index} className="mb-4 bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
        <View className="h-44 bg-gray-200" />
        <View className="p-4">
          <View className="h-5 w-2/3 bg-gray-200 rounded-full mb-3" />
          <View className="h-3 w-1/3 bg-gray-200 rounded-full mb-4" />
          <View className="flex-row gap-2">
            <View className="h-6 w-20 bg-orange-100 rounded-full" />
            <View className="h-6 w-20 bg-blue-100 rounded-full" />
            <View className="h-6 w-20 bg-green-100 rounded-full" />
          </View>
        </View>
        <View className="px-4 pb-4">
          <View className="border-t border-gray-100 pt-3 flex-row justify-end gap-2">
            <View className="h-9 w-20 bg-gray-200 rounded-full" />
            <View className="h-9 w-20 bg-[#FFD8C7] rounded-full" />
          </View>
        </View>
      </View>
    ))}
  </View>
);

const PRIME_WARMUP_WAIT_TIMEOUT_MS = 20_000;
const PRIME_WARMUP_LOADING_MESSAGE = "Finishing your personalized warm-up...";
const createEmptyMealLoadingState = (): Record<MealType, boolean> => ({
  breakfast: false,
  lunch: false,
  dinner: false,
});

const getMealLoadingMessage = (mealType: MealType) => `Finding ${mealType} ideas...`;
const createItemsByMealFromRecommendationResult = (result?: any): ItemsByMeal => ({
  breakfast: (result?.recommendationsByMeal?.breakfast || []).slice(0, 5),
  lunch: (result?.recommendationsByMeal?.lunch || []).slice(0, 5),
  dinner: (result?.recommendationsByMeal?.dinner || []).slice(0, 5),
});
const getCachedSeedSnapshot = (
  apiURL?: string,
  userId?: string | null,
  mealType: MealType | "all" = "all"
) => {
  if (!apiURL || !userId) return null;

  return (
    peekCachedRecommendations({ apiURL, userId, mealType }) ||
    (mealType !== "all"
      ? peekCachedRecommendations({ apiURL, userId, mealType: "all" })
      : null)
  );
};

const PlanningScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const isScreenFocused = useIsFocused();
  const configuredApiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
  const initialRecommendationSnapshotRef = useRef(
    getCachedSeedSnapshot(configuredApiURL, userId, "breakfast")
  );
  const initialRecommendationResult = initialRecommendationSnapshotRef.current?.result;
  const isMountedRef = useRef(true);
  const latestRequestIdsRef = useRef<Record<string, number>>({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    all: 0,
  });
  const hasRecommendationContentRef = useRef(false);
  const selectedMealTypeRef = useRef<MealType>("breakfast");
  const itemsByMealRef = useRef<ItemsByMeal>(createEmptyItemsByMeal());
  const loadingMealsRef = useRef<Record<MealType, boolean>>(createEmptyMealLoadingState());
  const mostConsumedItemsCountRef = useRef(0);
  const loadRecommendationsRef = useRef<((options?: { forceExploration?: boolean; mealType?: MealType | "all"; skipPrimeCheck?: boolean }) => Promise<void>) | null>(null);
  const backgroundPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBackgroundPrefetchingRef = useRef(false);
  const isScreenFocusedRef = useRef(true);
  const addRequestInFlightRef = useRef(false);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedMealType, setSelectedMealType] = useState<MealType>("breakfast");
  const [isInitialLoading, setIsInitialLoading] = useState(() => !initialRecommendationResult);
  const [isRefreshingRecommendations, setIsRefreshingRecommendations] = useState(false);
  const [isPrimeWarmupPending, setIsPrimeWarmupPending] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  const [itemsByMeal, setItemsByMeal] = useState<ItemsByMeal>(() => createItemsByMealFromRecommendationResult(initialRecommendationResult));
  const [loadingMeals, setLoadingMeals] = useState<Record<MealType, boolean>>(createEmptyMealLoadingState());
  const [mostConsumedItems, setMostConsumedItems] = useState<any[]>(() => (initialRecommendationResult?.mostConsumedItems || []).slice(0, 10));
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState(() => Math.max(1200, Number(initialRecommendationResult?.dailyCalorieTarget || 2000)));
  const [consumedCalories, setConsumedCalories] = useState(0);
  const [usingSafetyFallback, setUsingSafetyFallback] = useState(() => !!initialRecommendationResult?.payload?.used_safety_fallback);
  const [usingCachedRecommendations, setUsingCachedRecommendations] = useState(() => !!initialRecommendationResult);

  const [showSuccess, setShowSuccess] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: "", message: "", onConfirm: () => setAlertVisible(false) });
  const [isRecentModalVisible, setIsRecentModalVisible] = useState(false);

  const displayedItems = itemsByMeal[selectedMealType] || [];
  const isSelectedMealLoading = loadingMeals[selectedMealType];
  const hasAnyRecommendations = useMemo(
    () => MEAL_TYPES.some((mealType) => (itemsByMeal[mealType] || []).length > 0),
    [itemsByMeal]
  );

  const showCustomAlert = (title: string, message: string) => {
    setAlertConfig({ title, message, onConfirm: () => setAlertVisible(false) });
    setAlertVisible(true);
  };

  const isPlanningScreenActive = () => isMountedRef.current && isScreenFocusedRef.current;

  const showMealLogOutcome = (payload: any) => {
    if (!isPlanningScreenActive()) return;

    if (payload?.exceededLimit) {
      showCustomAlert("Calorie Target Exceeded", "Food added, but you crossed your daily calorie goal.");
    } else if (payload?.reachedTarget) {
      showCustomAlert("Calorie Target Reached", "Great job! You reached your daily calorie target.");
    } else {
      setShowSuccess(true);
    }
  };

  const applyRecommendationResult = useCallback((
    result: any,
    mealScope: MealType | "all" = "all",
    options: { updateMostConsumed?: boolean; updateStatus?: boolean } = {}
  ) => {
    const nextItemsByMeal = {
      breakfast: (result?.recommendationsByMeal?.breakfast || []).slice(0, 5),
      lunch: (result?.recommendationsByMeal?.lunch || []).slice(0, 5),
      dinner: (result?.recommendationsByMeal?.dinner || []).slice(0, 5),
    };

    const shouldUseTransition = mealScope !== "all" && mealScope !== selectedMealTypeRef.current;
    const commitRecommendationResult = () => {
      setItemsByMeal((previousItemsByMeal) => {
        const mergedItemsByMeal = mealScope === "all"
          ? nextItemsByMeal
          : {
              ...previousItemsByMeal,
              [mealScope]: nextItemsByMeal[mealScope],
            };

        hasRecommendationContentRef.current = MEAL_TYPES.some((mealType) => mergedItemsByMeal[mealType].length > 0);
        return mergedItemsByMeal;
      });

      if (options.updateMostConsumed ?? (mealScope === "all" || mostConsumedItemsCountRef.current === 0)) {
        setMostConsumedItems((result?.mostConsumedItems || []).slice(0, 10));
      }
      setDailyCalorieTarget(Math.max(1200, Number(result?.dailyCalorieTarget || 2000)));
      if (options.updateStatus ?? true) {
        setUsingSafetyFallback(!!result?.payload?.used_safety_fallback);
        setUsingCachedRecommendations(!!result?.usedCachedFallback);
      }
    };

    if (shouldUseTransition) {
      startTransition(commitRecommendationResult);
      return;
    }

    commitRecommendationResult();
  }, []);

  useEffect(() => {
    selectedMealTypeRef.current = selectedMealType;
  }, [selectedMealType]);

  useEffect(() => {
    itemsByMealRef.current = itemsByMeal;
  }, [itemsByMeal]);

  useEffect(() => {
    loadingMealsRef.current = loadingMeals;
  }, [loadingMeals]);

  useEffect(() => {
    mostConsumedItemsCountRef.current = mostConsumedItems.length;
  }, [mostConsumedItems.length]);

  const queueBackgroundMealPrefetches = useCallback((anchorMealType: MealType) => {
    const hasUnloadedMeal = MEAL_TYPES.some(
      (mealType) =>
        mealType !== anchorMealType &&
        (itemsByMealRef.current[mealType] || []).length === 0 &&
        !loadingMealsRef.current[mealType]
    );

    if (!hasUnloadedMeal || backgroundPrefetchTimeoutRef.current || isBackgroundPrefetchingRef.current) {
      return;
    }

    backgroundPrefetchTimeoutRef.current = setTimeout(() => {
      backgroundPrefetchTimeoutRef.current = null;

      if (!isMountedRef.current || isBackgroundPrefetchingRef.current) {
        return;
      }

      void (async () => {
        isBackgroundPrefetchingRef.current = true;

        try {
          for (const mealType of MEAL_TYPES) {
            if (
              mealType === anchorMealType ||
              (itemsByMealRef.current[mealType] || []).length > 0 ||
              loadingMealsRef.current[mealType]
            ) {
              continue;
            }

            await loadRecommendationsRef.current?.({ mealType, skipPrimeCheck: true });
          }
        } finally {
          isBackgroundPrefetchingRef.current = false;
        }
      })();
    }, 1200);
  }, []);

  const refreshDailyProgress = useCallback(async () => {
    if (!userId) return;
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const dateKey = formatLocalYYYYMMDD(selectedDate);
      const response = await fetch(`${apiURL}/api/meals/summary/${userId}/${dateKey}`);
      if (!response.ok) return;
      const meals = await response.json();
      const total = (Array.isArray(meals) ? meals : []).reduce((sum: number, item: any) => sum + Number(item?.calories || 0), 0);
      setConsumedCalories(Math.round(total));
    } catch {
      // keep previous value
    }
  }, [selectedDate, userId]);

  const maybeAwaitPrimeWarmup = useCallback(
    async (apiURL: string, requestId: number, mealType: MealType | "all") => {
      if (!userId) return;

      const primeStatus = await getPrimeRecommendationStatus({
        apiURL,
        clerkId: userId,
        mealType,
      });

      if (!isMountedRef.current || latestRequestIdsRef.current[mealType] !== requestId) return;

      if (primeStatus?.warmed) {
        return;
      }

      if (primeStatus?.warming) {
        setIsPrimeWarmupPending(true);
        setLoadingMessage(PRIME_WARMUP_LOADING_MESSAGE);

        try {
          await primeRecommendationsDetailed({
            apiURL,
            clerkId: userId,
            mealType,
            waitForWarmup: true,
            waitTimeoutMs: PRIME_WARMUP_WAIT_TIMEOUT_MS,
          });
        } finally {
          if (isMountedRef.current && latestRequestIdsRef.current[mealType] === requestId) {
            setIsPrimeWarmupPending(false);
          }
        }

        return;
      }

      void primeRecommendations({ apiURL, clerkId: userId, mealType });
    },
    [userId]
  );

  const loadRecommendations = useCallback(
    async (options: { forceExploration?: boolean; mealType?: MealType | "all"; skipPrimeCheck?: boolean } = {}) => {
      if (!userId) return;
      const requestedMealType = options.mealType || selectedMealTypeRef.current;
      const requestId = (latestRequestIdsRef.current[requestedMealType] || 0) + 1;
      latestRequestIdsRef.current[requestedMealType] = requestId;

      const isMealScopedRequest = requestedMealType !== "all";
      const hasRequestedMealContent = isMealScopedRequest
        ? (itemsByMealRef.current[requestedMealType] || []).length > 0
        : hasRecommendationContentRef.current;
      const isSelectedMealRequest = requestedMealType === selectedMealTypeRef.current;
      const shouldShowInitialSkeleton = !hasRecommendationContentRef.current && isSelectedMealRequest;
      const shouldShowMealSkeleton = !shouldShowInitialSkeleton && isMealScopedRequest && isSelectedMealRequest && !hasRequestedMealContent;
      const shouldUpdateStatusForResult = () => requestedMealType === "all" || selectedMealTypeRef.current === requestedMealType;

      if (shouldShowInitialSkeleton) {
        setIsInitialLoading(true);
      } else if (isSelectedMealRequest && hasRequestedMealContent) {
        setIsRefreshingRecommendations(true);
      }

      setLoadingMeals((previousLoadingMeals) =>
        requestedMealType === "all"
          ? { breakfast: true, lunch: true, dinner: true }
          : { ...previousLoadingMeals, [requestedMealType]: true }
      );

      setLoadingMessage(LOADING_MESSAGES[0]);
      let messageIndex = 0;
      let ticker: ReturnType<typeof setInterval> | null = null;

      try {
        const apiURL = configuredApiURL;
        if (!apiURL) throw new Error("Missing backend URL");

        const cachedSnapshot = !options.forceExploration
          ? getCachedSeedSnapshot(apiURL, userId, requestedMealType)
          : null;

        if ((shouldShowInitialSkeleton || shouldShowMealSkeleton) && cachedSnapshot?.result) {
          applyRecommendationResult(cachedSnapshot.result, requestedMealType, {
            updateMostConsumed: mostConsumedItemsCountRef.current === 0,
            updateStatus: false,
          });

          if (shouldUpdateStatusForResult()) {
            setUsingSafetyFallback(!!cachedSnapshot.result.payload?.used_safety_fallback);
            setUsingCachedRecommendations(true);
          }

          if (shouldShowInitialSkeleton) {
            setIsInitialLoading(false);
          }
          setIsRefreshingRecommendations(true);
        }

        if (shouldShowInitialSkeleton && !options.forceExploration && !options.skipPrimeCheck) {
          await maybeAwaitPrimeWarmup(apiURL, requestId, requestedMealType);
          if (!isMountedRef.current || latestRequestIdsRef.current[requestedMealType] !== requestId) return;
        }

        if (shouldShowInitialSkeleton) {
          setLoadingMessage(LOADING_MESSAGES[0]);
          ticker = setInterval(() => {
            messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
            setLoadingMessage(LOADING_MESSAGES[messageIndex]);
          }, 1400);
        } else if (shouldShowMealSkeleton) {
          setLoadingMessage(getMealLoadingMessage(requestedMealType));
        }

        const result = await fetchRecommendations({
          apiURL,
          userId,
          mealType: requestedMealType,
          forceExploration: !!options.forceExploration,
          onUpdate: (update) => {
            if (!isMountedRef.current || latestRequestIdsRef.current[requestedMealType] !== requestId) return;
            applyRecommendationResult(update, requestedMealType, {
              updateMostConsumed: requestedMealType === "all" || mostConsumedItemsCountRef.current === 0,
              updateStatus: shouldUpdateStatusForResult(),
            });

            if (
              requestedMealType !== "all" &&
              requestedMealType === selectedMealTypeRef.current &&
              update.source === "network" &&
              !update.usedCachedFallback &&
              !update.payload?.used_safety_fallback
            ) {
              queueBackgroundMealPrefetches(requestedMealType);
            }
          },
        });

        if (!isMountedRef.current || latestRequestIdsRef.current[requestedMealType] !== requestId) return;

        if (result.ok) {
          applyRecommendationResult(result, requestedMealType, {
            updateMostConsumed: requestedMealType === "all" || mostConsumedItemsCountRef.current === 0,
            updateStatus: shouldUpdateStatusForResult(),
          });

          if (
            requestedMealType !== "all" &&
            requestedMealType === selectedMealTypeRef.current &&
            result.source === "network" &&
            !result.usedCachedFallback &&
            !result.payload?.used_safety_fallback
          ) {
            queueBackgroundMealPrefetches(requestedMealType);
          }
        } else if (shouldUpdateStatusForResult()) {
          setUsingSafetyFallback(true);
        }
      } catch {
        if (!hasRecommendationContentRef.current && shouldUpdateStatusForResult()) {
          setUsingSafetyFallback(true);
        }
      } finally {
        setIsPrimeWarmupPending(false);
        if (ticker) {
          clearInterval(ticker);
        }
        if (!isMountedRef.current || latestRequestIdsRef.current[requestedMealType] !== requestId) return;
        setLoadingMeals((previousLoadingMeals) =>
          requestedMealType === "all"
            ? createEmptyMealLoadingState()
            : { ...previousLoadingMeals, [requestedMealType]: false }
        );
        if (shouldShowInitialSkeleton) {
          setIsInitialLoading(false);
        }
        if (isSelectedMealRequest) {
          setIsRefreshingRecommendations(false);
        }
      }
    },
    [applyRecommendationResult, configuredApiURL, maybeAwaitPrimeWarmup, queueBackgroundMealPrefetches, userId]
  );

  useEffect(() => {
    loadRecommendationsRef.current = loadRecommendations;
  }, [loadRecommendations]);

  const handleSelectMealType = useCallback((mealType: MealType) => {
    selectedMealTypeRef.current = mealType;
    setSelectedMealType(mealType);

    if ((itemsByMeal[mealType] || []).length > 0 || loadingMeals[mealType]) {
      return;
    }

    void loadRecommendations({ mealType, skipPrimeCheck: true });
  }, [itemsByMeal, loadingMeals, loadRecommendations]);

  useEffect(() => {
    hasRecommendationContentRef.current = hasAnyRecommendations;
  }, [hasAnyRecommendations]);

  useEffect(() => {
    isScreenFocusedRef.current = isScreenFocused;
    if (!isScreenFocused) {
      setShowSuccess(false);
    }
  }, [isScreenFocused]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (backgroundPrefetchTimeoutRef.current) {
        clearTimeout(backgroundPrefetchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadRecommendations({ mealType: selectedMealTypeRef.current });
  }, [loadRecommendations]);

  useFocusEffect(
    useCallback(() => {
      refreshDailyProgress();
    }, [refreshDailyProgress])
  );

  // NOTE: Shuffle sends "Skipped" feedback so ML can down-rank these combos.
  const handleShuffle = async () => {
    if (userId && displayedItems.length > 0) {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      await Promise.all(
        displayedItems.map((item) =>
          sendRecommendationFeedback({
            apiURL,
            clerkId: userId,
            comboId: item?.id || item?.food_id,
            mealType: selectedMealType,
            status: "Skipped",
            ml_tag: item?.ml_tag,
            explanation: item?.explanation,
            itemTitles: Array.isArray(item?.items)
              ? item.items.map((comboItem: any) => comboItem?.title).filter(Boolean)
              : [item?.title].filter(Boolean),
          })
        )
      );
    }
    return loadRecommendations({ forceExploration: true, mealType: selectedMealType, skipPrimeCheck: true });
  };

  // NOTE: Add button saves all combo items to the meal log.
  const handleAddRecommendedItem = async (item: any) => {
    if (!userId || addRequestInFlightRef.current) return;
    addRequestInFlightRef.current = true;

    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!apiURL) throw new Error("Missing backend URL");

      const date = formatLocalYYYYMMDD(selectedDate);
      const mealType = selectedMealType;
      const comboItems = Array.isArray(item?.items) && item.items.length > 0 ? item.items : [item];
      const payload = await addMealsBatch(
        comboItems.map((comboItem: any) => ({
          apiURL,
          clerkId: userId,
          date,
          mealType,
          foodName: comboItem.title || "Unknown Item",
          calories: Number(comboItem.calories || 0),
          protein: Number(comboItem.protein || 0),
          carbs: Number(comboItem.carbs || 0),
          fats: Number(comboItem.fats || 0),
          image: comboItem.image || "",
        }))
      );

      const totalCalories = comboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.calories || 0), 0);
      if (isMountedRef.current) {
        setConsumedCalories(
          Math.round(Number(payload?.dailyTotalCalories || consumedCalories + totalCalories))
        );
        setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      }

      void sendRecommendationFeedback({
        apiURL,
        clerkId: userId,
        comboId: item?.id || item?.food_id,
        mealType,
        status: "Accepted",
        ml_tag: item?.ml_tag,
        explanation: item?.explanation,
        itemTitles: comboItems.map((comboItem: any) => comboItem?.title).filter(Boolean),
      }).catch((error) => console.warn("Failed to send recommendation feedback:", error));

      showMealLogOutcome(payload);
    } catch {
      if (isPlanningScreenActive()) {
        Alert.alert("Error", "Failed to add food item");
      }
    } finally {
      addRequestInFlightRef.current = false;
    }
  };

  const handleSkipItem = async (item: any, itemIndex: number) => {
    if (!userId) return;
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
    await sendRecommendationFeedback({
      apiURL,
      clerkId: userId,
      comboId: item?.id || item?.food_id,
      mealType: selectedMealType,
      status: "Skipped",
      ml_tag: item?.ml_tag,
      explanation: item?.explanation,
      itemTitles: Array.isArray(item?.items)
        ? item.items.map((comboItem: any) => comboItem?.title).filter(Boolean)
        : [item?.title].filter(Boolean),
    });

    setItemsByMeal((prev) => ({
      ...prev,
      [selectedMealType]: prev[selectedMealType].filter((_item, index) => index !== itemIndex),
    }));
  };

  const handleLoveItem = async (item: any) => {
    if (!userId) return;
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
    await sendRecommendationFeedback({
      apiURL,
      clerkId: userId,
      comboId: item?.id || item?.food_id,
      mealType: selectedMealType,
      status: "Loved",
      ml_tag: item?.ml_tag,
      explanation: item?.explanation,
      itemTitles: Array.isArray(item?.items)
        ? item.items.map((comboItem: any) => comboItem?.title).filter(Boolean)
        : [item?.title].filter(Boolean),
    });
  };

  const goToDetail = (item: any) => {
    router.push({
      pathname: "/(tabs)/meal/comboDetail",
      params: { itemData: JSON.stringify(item), selectedDate: formatLocalYYYYMMDD(selectedDate) },
    });
  };

  const handleAddManualFood = async (foodItem: any) => {
    if (!userId) return;
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const date = formatLocalYYYYMMDD(selectedDate);
      const response = await fetch(`${apiURL}/api/meals/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        }),
      });

      if (!response.ok) throw new Error("Could not save food");
      const payload = await response.json();
      setConsumedCalories(Math.round(Number(payload?.dailyTotalCalories || consumedCalories + Number(foodItem?.calories || 0))));
      setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      
      setIsModalVisible(false);
      
      setTimeout(() => {
        setShowSuccess(true);
      }, 500);

    } catch {
      Alert.alert("Error", "Network error.");
    }
  };

  const handleAddRecentMeals = async (mealsToAdd: any[]) => {
    if (!userId || mealsToAdd.length === 0 || addRequestInFlightRef.current) return;
    addRequestInFlightRef.current = true;
    
    setIsRecentModalVisible(false);
    
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!apiURL) throw new Error("Missing backend URL");

      const date = formatLocalYYYYMMDD(selectedDate);
      const mealType = selectedMealType;
      const payload = await addMealsBatch(
        mealsToAdd.map((meal) => ({
          apiURL,
          clerkId: userId,
          date,
          mealType,
          foodName: meal.foodName || "Unknown Item",
          calories: Number(meal.calories || 0),
          protein: Number(meal.protein || 0),
          carbs: Number(meal.carbs || 0),
          fats: Number(meal.fats || 0),
          image: meal.image || "",
        }))
      );

      const totalCalories = mealsToAdd.reduce((sum: number, meal: any) => sum + Number(meal?.calories || 0), 0);
      if (isMountedRef.current) {
        setConsumedCalories(Math.round(Number(payload?.dailyTotalCalories || consumedCalories + totalCalories)));
        setDailyCalorieTarget(Math.max(1200, Number(payload?.dailyTarget || dailyCalorieTarget)));
      }

      showMealLogOutcome(payload);
    } catch {
      if (isPlanningScreenActive()) {
        showCustomAlert("Error", "Network error while adding recent meals.");
      }
    } finally {
      addRequestInFlightRef.current = false;
    }
  };

  const progressRatio = useMemo(() => {
    if (dailyCalorieTarget <= 0) return 0;
    return Math.min(1, consumedCalories / dailyCalorieTarget);
  }, [consumedCalories, dailyCalorieTarget]);

  // Keep planning status copy in one place so only one user-facing message is shown at a time.
  const isShowingInitialSkeleton = isInitialLoading && !hasAnyRecommendations;
  const isShowingMealSkeleton = !isShowingInitialSkeleton && isSelectedMealLoading && displayedItems.length === 0;
  const activeLoadingMessage = isShowingInitialSkeleton
    ? (isPrimeWarmupPending ? "Getting your meal plan ready..." : loadingMessage)
    : isShowingMealSkeleton
      ? getMealLoadingMessage(selectedMealType)
      : null;
  const topStatusMessage = !isShowingInitialSkeleton && !isShowingMealSkeleton
    ? (usingSafetyFallback && !isInitialLoading
        ? "We couldn't refresh fresh meal ideas right now, so we're showing reliable suggestions instead."
        : (isRefreshingRecommendations || (usingCachedRecommendations && hasAnyRecommendations))
          ? "Updating your meal ideas..."
          : null)
    : null;
  const isFallbackStatusMessage = topStatusMessage?.includes("reliable suggestions") ?? false;

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
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

        <View className="flex-row justify-between mb-5">
          {MEAL_TYPES.map((type) => {
            const isMealSelected = selectedMealType === type;
            const isMealLoading = loadingMeals[type];
            const hasMealContent = (itemsByMeal[type] || []).length > 0;

            return (
              <TouchableOpacity
                key={type}
                onPress={() => handleSelectMealType(type)}
                className={`flex-1 py-3 rounded-xl mr-2 items-center ${isMealSelected ? "bg-[#FFCAB0]" : "bg-gray-50"}`}
              >
                <View className="flex-row items-center">
                  <Text className={`font-bold capitalize ${isMealSelected ? "text-white" : "text-gray-900"}`}>{type}</Text>
                  {isMealLoading ? (
                    <ActivityIndicator size="small" color={isMealSelected ? "#FFFFFF" : "#007BFF"} className="ml-2" />
                  ) : hasMealContent && !isMealSelected ? (
                    <View className="ml-2 w-2 h-2 rounded-full bg-emerald-500" />
                  ) : null}
                </View>
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

        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-lg font-bold">Most consumed foods</Text>
          <TouchableOpacity onPress={() => setIsModalVisible(true)} className="flex-row items-center">
            <Ionicons name="add-circle-outline" size={18} color="#007BFF" />
            <Text className="text-primary font-bold ml-1">Add custom food</Text>
          </TouchableOpacity>
        </View>

        <MostConsumedFoodsStrip items={mostConsumedItems} onPressItem={goToDetail} />

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-row items-center">
            <Text className="text-xl font-bold">Recommended</Text>
            <InfoButton onPress={() => showCustomAlert("How it works", "These foods are recommended based on your goal and eating behaviors.")} />
            {hasAnyRecommendations && usingCachedRecommendations && (
              <View
                className="ml-2 px-2 py-1 rounded-full border bg-blue-50 border-blue-200"
              >
                <Text className="text-[11px] font-sans font-semibold text-blue-700">Updating</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setIsRecentModalVisible(true)}
            className="flex-row items-center bg-gray-50 px-3 py-2 rounded-full border border-gray-200"
          >
            <Ionicons name="time-outline" size={15} color="#007BFF" />
            <Text className="text-primary font-bold ml-2">Recent Meals</Text>
          </TouchableOpacity>
        </View>

        {topStatusMessage && (
          <View
            className={`flex-row items-center rounded-xl px-3 py-2 mb-4 border ${
              isFallbackStatusMessage
                ? "bg-amber-50 border-amber-200"
                : "bg-blue-50 border-blue-200"
            }`}
          >
            {!isFallbackStatusMessage && <ActivityIndicator size="small" color="#007BFF" />}
            <Text
              className={`text-xs font-sans font-semibold ${
                isFallbackStatusMessage
                  ? "text-amber-700"
                  : "text-blue-700"
              } ${!isFallbackStatusMessage ? "ml-2" : ""}`}
            >
              {topStatusMessage}
            </Text>
          </View>
        )}

        {isShowingInitialSkeleton ? (
          <View className="mt-4 mb-10">
            <Text className="text-gray-500 font-sans mb-4 text-center">{activeLoadingMessage}</Text>
            <RecommendationSkeletonList count={3} />
          </View>
        ) : isShowingMealSkeleton ? (
          <View className="mt-4 mb-10">
            <Text className="text-gray-500 font-sans mb-4 text-center">{activeLoadingMessage}</Text>
            <RecommendationSkeletonList count={2} />
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-bold capitalize">{selectedMealType}</Text>
              <TouchableOpacity onPress={handleShuffle} className="px-3 py-2 rounded-full bg-blue-50 border border-blue-200">
                <Text className="text-primary font-bold">Shuffle</Text>
              </TouchableOpacity>
            </View>

            {displayedItems.map((item, index) => (
              <ComboCard
                key={`${item.id || item.food_id}-${index}`}
                item={item}
                onAdd={() => handleAddRecommendedItem(item)}
                onSkip={() => handleSkipItem(item, index)}
                onPress={() => goToDetail(item)}
                onLove={() => handleLoveItem(item)}
              />
            ))}

            {!isInitialLoading && displayedItems.length === 0 && (
              <Text className="text-center text-gray-400 mt-10 mb-10">No recommendations available.</Text>
            )}
          </>
        )}
      </ScrollView>

      {/*
        By adding {boolean && <Modal />}, React Native physically destroys the modal 
        from the view hierarchy when it closes, ensuring no invisible layers block your touches! 
      */}
      {showSuccess && (
        <SuccessModal visible={showSuccess} message="Meal added successfully!" onClose={() => setShowSuccess(false)} />
      )}
      
      {isModalVisible && (
        <AddFoodModal visible={isModalVisible} onClose={() => setIsModalVisible(false)} mealType={selectedMealType} onAddFood={handleAddManualFood} />
      )}
      
      {alertVisible && (
        <CustomAlert visible={alertVisible} title={alertConfig.title} message={alertConfig.message} onConfirm={alertConfig.onConfirm} onCancel={undefined} />
      )}
      
      {isRecentModalVisible && (
        <RecentMealsModal visible={isRecentModalVisible} onClose={() => setIsRecentModalVisible(false)} onAddSelected={handleAddRecentMeals} />
      )}
    </SafeAreaView>
  );
};

export default PlanningScreen;
