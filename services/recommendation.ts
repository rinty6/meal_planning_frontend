import { Image as RNImage } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { resolveFoodImageFromFatSecret } from "./mealAPI";
import { authedFetch, type GetToken } from "./authedFetch";

type MealType = "breakfast" | "lunch" | "dinner";
type RecommendationStage = "base" | "hydrated";
type RecommendationSource = "network" | "cache";
type ImageLookupState = "resolved" | "pending" | "unavailable";
type ImageHydrationState = "idle" | "running" | "complete";
type ImageHydrationStats = {
  totalCount: number;
  resolvedCount: number;
  pendingCount: number;
  unavailableCount: number;
  missingCount: number;
};

type RecommendationResult = {
  ok: boolean;
  status: number;
  payload: any;
  recommendationsByMeal: Record<MealType, any[]>;
  mostConsumedItems: any[];
  dailyCalorieTarget: number;
  mealCalorieTargets: Record<string, any>;
  imageHydrationPending: boolean;
  imageHydrationState: ImageHydrationState;
  imageHydrationStats: ImageHydrationStats;
  stage: RecommendationStage;
  source: RecommendationSource;
  usedCachedFallback: boolean;
  cacheAgeMs: number;
};

type CachedRecommendationEntry = {
  savedAt: number;
  value: RecommendationResult;
};

type RecommendationFetchArgs = {
  apiURL?: string;
  userId?: string | null;
  mealType?: MealType | "all";
  forceExploration?: boolean;
  timeoutMs?: number;
  onUpdate?: (result: RecommendationResult) => void;
  getToken?: GetToken;
};

type FeedbackArgs = {
  apiURL?: string;
  clerkId?: string | null;
  comboId?: string;
  mealType?: MealType;
  status?: "Accepted" | "Rejected" | "Loved" | "Skipped";
  ml_tag?: string;
  explanation?: string;
  itemTitle?: string;
  itemTitles?: string[];
  getToken?: GetToken;
};

type PrimeArgs = {
  apiURL?: string;
  clerkId?: string | null;
  userId?: string | null;
  demographics?: Record<string, any>;
  mealType?: MealType | "all";
  waitForWarmup?: boolean;
  waitTimeoutMs?: number;
  getToken?: GetToken;
};

type PrimeStatusArgs = {
  apiURL?: string;
  clerkId?: string | null;
  mealType?: MealType | "all";
  getToken?: GetToken;
};

export type PrimeWarmupResult = {
  ok: boolean;
  status: number;
  primed: boolean;
  queued: boolean;
  warmed: boolean;
  warming: boolean;
  waited: boolean;
  waitedMs: number;
  waitTimeoutMs: number;
  waitTimedOut: boolean;
  reason: string;
  retryAfterMs: number;
};

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];
const RECOMMENDATION_FETCH_TIMEOUT_MS = 2000;
const RECOMMENDATION_IMAGE_PREFETCH_LIMIT = 5;
const MOST_CONSUMED_IMAGE_HYDRATION_LIMIT = 3;
const RECOMMENDATION_CACHE_STORAGE_KEY = "meal-app:recommendation-cache:v1";
const RECOMMENDATION_CACHE_MAX_ENTRIES = 12;
const RECOMMENDATION_CACHE_MAX_AGE_MS = 1000 * 60 * 30;
const FETCH_TIMEOUT_SENTINEL = Symbol("recommendation-fetch-timeout");
const PRIME_SUCCESS_REASONS = new Set(["queued", "ttl_active", "already_priming"]);

const recommendationCache = new Map<string, CachedRecommendationEntry>();
const inFlightRecommendationRequests = new Map<string, Promise<RecommendationResult | null>>();
const inFlightRecommendationHydrations = new Map<
  string,
  { promise: Promise<RecommendationResult>; source: RecommendationSource }
>();
const inFlightPrimeStatusRequests = new Map<string, Promise<PrimeWarmupResult | null>>();
const inFlightPrimeRequests = new Map<string, Promise<PrimeWarmupResult | null>>();
let hasLoadedRecommendationCache = false;
let recommendationCacheReadyPromise: Promise<void> | null = null;
let recommendationCachePersistTimer: ReturnType<typeof setTimeout> | null = null;

const FRONTEND_SAFETY_FALLBACKS: Record<
  MealType,
  { title: string; items: { title: string; calories: number; protein: number; carbs: number; fats: number }[] }[]
> = {
  breakfast: [
    {
      title: "Combo: Greek Yogurt + Berries + Almonds",
      items: [
        { title: "Greek Yogurt", calories: 100, protein: 17, carbs: 6, fats: 0 },
        { title: "Mixed Berries", calories: 57, protein: 1, carbs: 14, fats: 0 },
        { title: "Almonds", calories: 116, protein: 4.2, carbs: 4.3, fats: 10 },
      ],
    },
    {
      title: "Combo: Oatmeal + Banana + Milk",
      items: [
        { title: "Oatmeal", calories: 266, protein: 9, carbs: 45, fats: 5 },
        { title: "Banana", calories: 89, protein: 1.1, carbs: 23, fats: 0.3 },
        { title: "Milk", calories: 103, protein: 8, carbs: 12, fats: 2.4 },
      ],
    },
  ],
  lunch: [
    {
      title: "Combo: Chicken Salad Wrap + Fruit Cup + Iced Tea",
      items: [
        { title: "Chicken Salad Wrap", calories: 320, protein: 24, carbs: 30, fats: 11 },
        { title: "Fruit Cup", calories: 80, protein: 1, carbs: 20, fats: 0 },
        { title: "Iced Tea", calories: 5, protein: 0, carbs: 1, fats: 0 },
      ],
    },
    {
      title: "Combo: Turkey Sandwich + Side Salad + Sparkling Water",
      items: [
        { title: "Turkey Sandwich", calories: 340, protein: 26, carbs: 33, fats: 10 },
        { title: "Side Salad", calories: 60, protein: 2, carbs: 8, fats: 2 },
        { title: "Sparkling Water", calories: 0, protein: 0, carbs: 0, fats: 0 },
      ],
    },
  ],
  dinner: [
    {
      title: "Combo: Grilled Chicken + Garden Salad + Orange Juice",
      items: [
        { title: "Grilled Chicken", calories: 320, protein: 35, carbs: 4, fats: 17 },
        { title: "Garden Salad", calories: 70, protein: 2, carbs: 10, fats: 2 },
        { title: "Orange Juice", calories: 110, protein: 2, carbs: 26, fats: 0 },
      ],
    },
    {
      title: "Combo: Salmon Fillet + Vegetable Soup + Sparkling Water",
      items: [
        { title: "Salmon Fillet", calories: 330, protein: 30, carbs: 0, fats: 21 },
        { title: "Vegetable Soup", calories: 95, protein: 4, carbs: 16, fats: 2 },
        { title: "Sparkling Water", calories: 0, protein: 0, carbs: 0, fats: 0 },
      ],
    },
  ],
};

const ensureArray = (value: any) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalNumber = (value: any) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toCleanId = (value: any) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const isNumericId = (value: string) => /^\d+$/.test(value);

const cloneValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// Normalize known sushi aliases before recommendation cards are rendered.
const normalizeDisplayFoodTitle = (value: any, fallback: string) => {
  const title = String(value ?? "").trim() || fallback;
  return title.replace(/\b(?:hosomaki|hosomakis|hossomakis|homosakis)\b/gi, "Sushi");
};

const buildPrimeIdentityKey = ({
  clerkId,
  userId,
}: {
  clerkId?: string | null;
  userId?: string | null;
}) => {
  const normalizedClerkId = toCleanId(clerkId);
  const normalizedUserId = toCleanId(userId);
  if (!normalizedClerkId && !normalizedUserId) return "";
  return `clerk:${normalizedClerkId || "-"}|user:${normalizedUserId || "-"}`;
};

const buildPrimeDemographicsKey = (demographics?: Record<string, any>) => {
  if (!demographics) return "";

  const normalizedEntries = Object.entries(demographics)
    .filter(([, value]) => value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  if (normalizedEntries.length === 0) return "";

  return JSON.stringify(Object.fromEntries(normalizedEntries));
};

const buildPrimeScopeKey = ({
  apiURL,
  identityKey,
  mealType = "all",
}: {
  apiURL: string;
  identityKey: string;
  mealType?: MealType | "all";
}) => `${apiURL}|${identityKey}|meal:${mealType}`;

const buildPrimeStatusRequestKey = ({
  apiURL,
  clerkId,
  mealType = "all",
}: {
  apiURL: string;
  clerkId: string;
  mealType?: MealType | "all";
}) =>
  buildPrimeScopeKey({
    apiURL,
    identityKey: buildPrimeIdentityKey({ clerkId }),
    mealType,
  });

const buildPrimeRequestKey = ({
  apiURL,
  clerkId,
  userId,
  demographics,
  mealType = "all",
  waitForWarmup = false,
  waitTimeoutMs,
}: PrimeArgs & { apiURL: string }) => {
  const identityKey = buildPrimeIdentityKey({ clerkId, userId });
  const demographicsKey = buildPrimeDemographicsKey(demographics);

  return [
    buildPrimeScopeKey({ apiURL, identityKey, mealType }),
    `wait:${waitForWarmup ? "1" : "0"}`,
    `timeout:${Math.max(0, toNumber(waitTimeoutMs, 0))}`,
    `demographics:${demographicsKey || "-"}`,
  ].join("|");
};

const buildRecommendationCacheKey = (
  apiURL: string,
  userId: string,
  mealType: MealType | "all",
  forceExploration = false,
) => `${apiURL}|${userId}|${mealType}|force:${forceExploration ? "1" : "0"}`;

const isCachedRecommendationEntry = (value: any): value is CachedRecommendationEntry =>
  !!value &&
  typeof value === "object" &&
  typeof value.savedAt === "number" &&
  !!value.value &&
  typeof value.value === "object";

const canUseRecommendationCacheStorage = () =>
  typeof window !== "undefined" ||
  (typeof navigator !== "undefined" && navigator.product === "ReactNative");

const pruneRecommendationCacheEntries = () => {
  const minSavedAt = Date.now() - RECOMMENDATION_CACHE_MAX_AGE_MS;
  const validEntries = Array.from(recommendationCache.entries())
    .filter(([, entry]) => entry.savedAt >= minSavedAt)
    .sort((left, right) => right[1].savedAt - left[1].savedAt)
    .slice(0, RECOMMENDATION_CACHE_MAX_ENTRIES);

  recommendationCache.clear();
  for (const [key, entry] of validEntries) {
    recommendationCache.set(key, entry);
  }

  return validEntries;
};

// Keep a small persisted cache so cold app restarts can reuse the latest recommendations.
const persistRecommendationCache = async () => {
  if (!canUseRecommendationCacheStorage()) return;

  try {
    const payload = JSON.stringify(Object.fromEntries(pruneRecommendationCacheEntries()));
    await AsyncStorage.setItem(RECOMMENDATION_CACHE_STORAGE_KEY, payload);
  } catch (error) {
    console.warn("[recommendation.ts] failed to persist recommendation cache", error);
  }
};

const scheduleRecommendationCachePersist = () => {
  if (recommendationCachePersistTimer !== null) return;

  recommendationCachePersistTimer = setTimeout(() => {
    recommendationCachePersistTimer = null;
    void persistRecommendationCache();
  }, 200);
};

const ensureRecommendationCacheReady = async () => {
  if (hasLoadedRecommendationCache) return;
  if (!canUseRecommendationCacheStorage()) {
    hasLoadedRecommendationCache = true;
    return;
  }

  if (!recommendationCacheReadyPromise) {
    recommendationCacheReadyPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECOMMENDATION_CACHE_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return;

        const minSavedAt = Date.now() - RECOMMENDATION_CACHE_MAX_AGE_MS;
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!isCachedRecommendationEntry(value) || value.savedAt < minSavedAt) continue;
          const existingEntry = recommendationCache.get(key);
          if (existingEntry && existingEntry.savedAt >= value.savedAt) continue;
          recommendationCache.set(key, {
            savedAt: value.savedAt,
            value: cloneValue(value.value),
          });
        }

        pruneRecommendationCacheEntries();
      } catch (error) {
        console.warn("[recommendation.ts] failed to load persisted recommendation cache", error);
      } finally {
        hasLoadedRecommendationCache = true;
      }
    })().finally(() => {
      recommendationCacheReadyPromise = null;
    });
  }

  await recommendationCacheReadyPromise;
};

void ensureRecommendationCacheReady();

const buildFrontendSafetyResult = (mealType: MealType | "all", reason: string): RecommendationResult => {
  const recommendationsByMeal = createEmptyRecommendationsByMeal();
  for (const currentMealType of MEAL_TYPES) {
    recommendationsByMeal[currentMealType] = FRONTEND_SAFETY_FALLBACKS[currentMealType].map((combo, index) =>
      normalizeRecommendedCombo(
        {
          id: `frontend-safety-${currentMealType}-${index + 1}`,
          combo_id: `frontend-safety-${currentMealType}-${index + 1}`,
          title: combo.title,
          items: combo.items.map((item) => ({
            ...item,
            explanation: "Safety fallback recommendation.",
            behavioral_insight: "Safety fallback recommendation.",
            ml_tag: "Safety",
          })),
        },
        currentMealType,
        index,
        0,
      )
    );
  }

  const selectedRecommendations = mealType === "all"
    ? recommendationsByMeal
    : {
        ...createEmptyRecommendationsByMeal(),
        [mealType]: recommendationsByMeal[mealType],
      };

  return buildRecommendationResult({
    ok: true,
    status: 200,
    payload: {
      recommendationsByMeal: selectedRecommendations,
      recommendedByMeal: selectedRecommendations,
      most_consumed_items: [],
      used_safety_fallback: true,
      fallback_reason: reason,
    },
    recommendationsByMeal: selectedRecommendations,
    mostConsumedItems: [],
    dailyCalorieTarget: 0,
    mealCalorieTargets: {},
    source: "cache",
    usedCachedFallback: true,
    imageHydrationState: "idle",
  });
};

const getCachedRecommendationResult = (cacheKey: string): { result: RecommendationResult; cacheAgeMs: number } | null => {
  const payload = recommendationCache.get(cacheKey);
  if (!payload) return null;
  if (payload.savedAt < Date.now() - RECOMMENDATION_CACHE_MAX_AGE_MS) {
    recommendationCache.delete(cacheKey);
    scheduleRecommendationCachePersist();
    return null;
  }
  const cacheAgeMs = Math.max(0, Date.now() - payload.savedAt);
  return {
    result: cloneValue(payload.value),
    cacheAgeMs,
  };
};

export const peekCachedRecommendations = ({
  apiURL,
  userId,
  mealType = "all",
  forceExploration = false,
}: RecommendationFetchArgs = {}) => {
  if (!apiURL || !userId) return null;
  void ensureRecommendationCacheReady();
  return getCachedRecommendationResult(
    buildRecommendationCacheKey(apiURL, userId, mealType, forceExploration)
  );
};

const setCachedRecommendationResult = (cacheKey: string, result: RecommendationResult) => {
  recommendationCache.set(cacheKey, { savedAt: Date.now(), value: cloneValue(result) });
  pruneRecommendationCacheEntries();
  scheduleRecommendationCachePersist();
};

const getOrStartRecommendationRequest = ({
  url,
  cacheKey,
  getToken,
  clerkId,
}: {
  url: string;
  cacheKey: string;
  getToken?: GetToken;
  clerkId?: string | null;
}) => {
  const existingRequest = inFlightRecommendationRequests.get(cacheKey);
  if (existingRequest) {
    console.log("[recommendation.ts] joining in-flight recommendation request", { cacheKey });
    return existingRequest;
  }

  const requestPromise = fetchNetworkRecommendationResult({ url, cacheKey, getToken, clerkId })
    .catch((error) => {
      console.warn("[recommendation.ts] recommendation fetch failed", error);
      return null;
    })
    .finally(() => {
      if (inFlightRecommendationRequests.get(cacheKey) === requestPromise) {
        inFlightRecommendationRequests.delete(cacheKey);
      }
    });

  inFlightRecommendationRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

const normalizePrimeWarmupResult = (payload: any, status: number): PrimeWarmupResult => {
  const reason = String(payload?.reason || "").trim() || "unknown";
  const queued = !!payload?.queued;
  const warmed = !!(payload?.warmed || reason === "already_cached");
  const warming = !!(
    payload?.warming ||
    (!warmed && queued) ||
    reason === "already_priming" ||
    reason === "preparing_warmup"
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    primed: !!payload?.primed || warmed || warming || reason === "ttl_active",
    queued,
    warmed,
    warming,
    waited: !!payload?.waited,
    waitedMs: Math.max(0, toNumber(payload?.waitedMs, 0)),
    waitTimeoutMs: Math.max(0, toNumber(payload?.waitTimeoutMs, 0)),
    waitTimedOut: !!payload?.waitTimedOut,
    reason,
    retryAfterMs: Math.max(0, toNumber(payload?.retryAfterMs, 0)),
  };
};

const getOrStartPrimeStatusRequest = ({
  requestKey,
  url,
  getToken,
  clerkId,
}: {
  requestKey: string;
  url: string;
  getToken?: GetToken;
  clerkId?: string | null;
}) => {
  const existingRequest = inFlightPrimeStatusRequests.get(requestKey);
  if (existingRequest) {
    console.log("[recommendation.ts] joining in-flight prime status request", { requestKey });
    return existingRequest;
  }

  const requestPromise = authedFetch(url, { getToken, clerkId })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      return normalizePrimeWarmupResult(payload, response.status);
    })
    .catch(() => null)
    .finally(() => {
      if (inFlightPrimeStatusRequests.get(requestKey) === requestPromise) {
        inFlightPrimeStatusRequests.delete(requestKey);
      }
    });

  inFlightPrimeStatusRequests.set(requestKey, requestPromise);
  return requestPromise;
};

const getOrStartPrimeRequest = ({
  requestKey,
  apiURL,
  body,
  getToken,
}: {
  requestKey: string;
  apiURL: string;
  body: Record<string, any>;
  getToken?: GetToken;
}) => {
  const existingRequest = inFlightPrimeRequests.get(requestKey);
  if (existingRequest) {
    console.log("[recommendation.ts] joining in-flight prime request", { requestKey });
    return existingRequest;
  }

  const requestPromise = authedFetch(`/api/prime`, {
    method: "POST",
    baseUrl: apiURL,
    getToken,
    clerkId: body?.clerkId,
    body: JSON.stringify(body),
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      return normalizePrimeWarmupResult(payload, response.status);
    })
    .catch(() => null)
    .finally(() => {
      if (inFlightPrimeRequests.get(requestKey) === requestPromise) {
        inFlightPrimeRequests.delete(requestKey);
      }
    });

  inFlightPrimeRequests.set(requestKey, requestPromise);
  return requestPromise;
};

const buildPrimeStatusUrl = (
  apiURL: string,
  clerkId: string,
  mealType: MealType | "all" = "all"
) => {
  const params = new URLSearchParams();
  if (mealType && mealType !== "all") {
    params.set("mealType", mealType);
  }
  const query = params.toString();
  return `${apiURL}/api/prime/status/${encodeURIComponent(clerkId)}${query ? `?${query}` : ""}`;
};

export const createEmptyRecommendationsByMeal = (): Record<MealType, any[]> => ({
  breakfast: [],
  lunch: [],
  dinner: [],
});

export const normalizeRecommendedItem = (item: any, mealType: MealType, index: number, slotTarget = 0) => {
  const initialImage = String(item?.image || "").trim();
  const normalizedId = toCleanId(item?.item_id || item?.id || item?.recipe_id || `${mealType}-item-${index}`);
  const recipeId = toCleanId(item?.recipe_id);
  const rawFoodId = toCleanId(item?.food_id || item?.id || `${mealType}-item-${index}`);
  const fatsecretFoodId = toCleanId(item?.fatsecret_food_id || "");
  const originalTitle = item?.original_title || item?.title || item?.food_name || `Food Item ${index + 1}`;
  const displayTitle = normalizeDisplayFoodTitle(item?.title || item?.food_name, `Food Item ${index + 1}`);
  const recipeAnchoredId =
    !!recipeId &&
    (rawFoodId === recipeId ||
      rawFoodId === `recipe-${recipeId}` ||
      rawFoodId === `local-${recipeId}`);
  const shouldForceLocalSentinel =
    !fatsecretFoodId &&
    !!rawFoodId &&
    !rawFoodId.startsWith("local-") &&
    (recipeAnchoredId || rawFoodId.startsWith("recipe-") || rawFoodId.startsWith("safety-") || !isNumericId(rawFoodId));
  const canonicalFoodId = shouldForceLocalSentinel
    ? `local-${recipeId || rawFoodId.replace(/^recipe-/, "") || normalizedId}`
    : rawFoodId;

  return {
    id: normalizedId,
    item_id: normalizedId,
    recipe_id: recipeId,
    food_id: canonicalFoodId,
    fatsecret_food_id: fatsecretFoodId,
    mealType,
    title: displayTitle,
    original_title: originalTitle,
    canonical_title: item?.canonical_title || item?.title || item?.food_name || "",
    mapped_title: item?.mapped_title || null,
    mapped_canonical_title: item?.mapped_canonical_title || null,
    category: item?.category || null,
    calories: Math.max(0, Math.round(toNumber(item?.calories ?? item?.cals, 0))),
    protein: Math.round(toNumber(item?.protein, 0) * 10) / 10,
    carbs: Math.round(toNumber(item?.carbs, 0) * 10) / 10,
    fats: Math.round(toNumber(item?.fats, 0) * 10) / 10,
    grams: Math.max(20, Math.round(toNumber(item?.grams, 100))),
    image: initialImage,
    // Respect a server-side "unavailable" verdict (Fix B): the backend already
    // tried to resolve this title against the shared cross-user image cache, so
    // re-hunting from the device would only replay the request storm the server
    // enrichment exists to prevent. The local placeholder renders instead.
    image_lookup_state: (initialImage
      ? "resolved"
      : item?.image_lookup_state === "unavailable"
        ? "unavailable"
        : "pending") as ImageLookupState,
    image_lookup_source: initialImage ? "payload" : null,
    serving_id: item?.serving_id || null,
    serving_description: item?.serving_description || "100 g",
    metric_serving_amount: toNumber(item?.metric_serving_amount, 0),
    metric_serving_unit: item?.metric_serving_unit || null,
    food_type: item?.food_type || null,
    brand_name: item?.brand_name || null,
    food_url: item?.food_url || null,
    allergens: ensureArray(item?.allergens),
    preferences: ensureArray(item?.preferences),
    food_sub_categories: ensureArray(item?.food_sub_categories),
    explanation: item?.explanation || item?.behavioral_insight || "",
    behavioral_insight: item?.behavioral_insight || item?.explanation || "",
    score: toNumber(item?.score, 0),
    knn_distance: toNumber(item?.knn_distance, 0),
    adjusted_distance: toNumber(item?.adjusted_distance, 0),
    consumed_recently: !!item?.consumed_recently,
    ml_tag: item?.ml_tag || "KNN",
    calorie_diff_ratio: toNumber(item?.calorie_diff_ratio, 0),
    serving_fit_ratio: toNumber(item?.serving_fit_ratio, 0),
    slot_target: Math.max(0, Math.round(toNumber(item?.slot_target || item?.calorie_target, slotTarget))),
  };
};

const normalizeRecommendedCombo = (combo: any, mealType: MealType, index: number, slotTarget = 0) => {
  const rawItems = ensureArray(combo?.items || combo?.combo_items || combo?.recommended_items);
  const normalizedItems = rawItems
    .map((item: any, itemIndex: number) => normalizeRecommendedItem(item, mealType, itemIndex, slotTarget))
    .filter((item: any) => item?.title);

  const totalCalories = normalizedItems.reduce((sum: number, item: any) => sum + toNumber(item?.calories, 0), 0);
  const totalProtein = normalizedItems.reduce((sum: number, item: any) => sum + toNumber(item?.protein, 0), 0);
  const totalCarbs = normalizedItems.reduce((sum: number, item: any) => sum + toNumber(item?.carbs, 0), 0);
  const totalFats = normalizedItems.reduce((sum: number, item: any) => sum + toNumber(item?.fats, 0), 0);

  const title =
    normalizeDisplayFoodTitle(
      combo?.title ||
        `Combo: ${normalizedItems.map((item: any) => item.title).filter(Boolean).join(" + ") || `Meal ${index + 1}`}`,
      `Combo: Meal ${index + 1}`,
    );

  return {
    id: toCleanId(combo?.combo_id || combo?.id || `${mealType}-combo-${index}`),
    combo_id: toCleanId(combo?.combo_id || combo?.id || `${mealType}-combo-${index}`),
    mealType,
    title,
    items: normalizedItems,
    total_calories: Math.round(totalCalories),
    total_protein: Math.round(totalProtein * 10) / 10,
    total_carbs: Math.round(totalCarbs * 10) / 10,
    total_fats: Math.round(totalFats * 10) / 10,
    explanation: combo?.explanation || combo?.behavioral_insight || "",
    behavioral_insight: combo?.behavioral_insight || combo?.explanation || "",
    score: toNumber(combo?.score, 0),
    ml_tag: combo?.ml_tag || "COMBO",
    slot_target: Math.max(0, Math.round(toNumber(combo?.slot_target || combo?.calorie_target, slotTarget))),
  };
};

const normalizeMealPayload = (mealPayload: any, mealType: MealType) => {
  if (!mealPayload) return [];
  const slotTarget = toNumber(mealPayload?.slot_target, 0);
  const combos = ensureArray(mealPayload?.combos || mealPayload?.recommended_combos).filter(Boolean);
  if (combos.length > 0) {
    return combos
      .map((combo, index) => normalizeRecommendedCombo(combo, mealType, index, slotTarget))
      .filter((combo: any) => combo?.items?.length);
  }
  if (Array.isArray(mealPayload) && mealPayload.length > 0 && Array.isArray(mealPayload[0]?.items)) {
    return mealPayload
      .map((combo, index) => normalizeRecommendedCombo(combo, mealType, index, slotTarget))
      .filter((combo: any) => combo?.items?.length);
  }
  const source = ensureArray(mealPayload?.recommended_items).length
    ? mealPayload.recommended_items
    : Array.isArray(mealPayload)
      ? mealPayload
      : ensureArray(mealPayload?.items);

  const output = source
    .map((item: any, index: number) => normalizeRecommendedItem(item, mealType, index, slotTarget))
    .filter((item: any) => item?.title);

  return output.slice(0, 10);
};

export const normalizeRecommendationsByMeal = (payload: any = {}) => {
  const normalized = createEmptyRecommendationsByMeal();
  const source = payload.recommendationsByMeal || payload.recommendedByMeal || payload.recommendations || {};

  if (!source || Object.keys(source).length === 0) {
    const slot = payload?.slot as MealType | undefined;
    if (slot && MEAL_TYPES.includes(slot)) {
      normalized[slot] = normalizeMealPayload(payload, slot);
    }
    return normalized;
  }

  for (const mealType of MEAL_TYPES) {
    normalized[mealType] = normalizeMealPayload(source[mealType], mealType);
  }
  return normalized;
};

const normalizeMostConsumedItem = (item: any) => {
  const originalTitle = item?.original_title || item?.title || item?.food_name || "Food Item";
  const displayTitle = normalizeDisplayFoodTitle(item?.title || item?.food_name, "Food Item");

  return ({
  id: String(item?.id || item?.food_id || "").trim(),
  food_id: String(item?.food_id || item?.id || "").trim(),
  fatsecret_food_id: String(item?.fatsecret_food_id || "").trim(),
  title: displayTitle,
  original_title: originalTitle,
  canonical_title: item?.canonical_title || item?.title || item?.food_name || "Food Item",
  food_name: displayTitle,
  meal_type: item?.meal_type || "",
  count: Math.max(0, Math.round(toNumber(item?.count ?? item?.number_appearance, 0))),
  number_appearance: Math.max(0, Math.round(toNumber(item?.number_appearance ?? item?.count, 0))),
  calories:
    toOptionalNumber(item?.calories ?? item?.cals ?? item?.serving_calories ?? item?.dataset_serving_calories) === undefined
      ? undefined
      : Math.max(
          0,
          Math.round(toOptionalNumber(item?.calories ?? item?.cals ?? item?.serving_calories ?? item?.dataset_serving_calories) || 0)
        ),
  protein:
    toOptionalNumber(item?.protein ?? item?.serving_protein ?? item?.dataset_serving_protein) === undefined
      ? undefined
      : Math.round(
          (toOptionalNumber(item?.protein ?? item?.serving_protein ?? item?.dataset_serving_protein) || 0) * 10
        ) / 10,
  carbs:
    toOptionalNumber(item?.carbs ?? item?.serving_carbs ?? item?.dataset_serving_carbs) === undefined
      ? undefined
      : Math.round(
          (toOptionalNumber(item?.carbs ?? item?.serving_carbs ?? item?.dataset_serving_carbs) || 0) * 10
        ) / 10,
  fats:
    toOptionalNumber(item?.fats ?? item?.fat ?? item?.serving_fats ?? item?.dataset_serving_fats) === undefined
      ? undefined
      : Math.round(
          (toOptionalNumber(item?.fats ?? item?.fat ?? item?.serving_fats ?? item?.dataset_serving_fats) || 0) * 10
        ) / 10,
  grams:
    toOptionalNumber(item?.grams ?? item?.serving_amount ?? item?.serving_grams ?? item?.metric_serving_amount) === undefined
      ? undefined
      : Math.max(
          0,
          Math.round(toOptionalNumber(item?.grams ?? item?.serving_amount ?? item?.serving_grams ?? item?.metric_serving_amount) || 0)
        ),
  serving_id: item?.serving_id || undefined,
  serving_description: item?.serving_description || undefined,
  metric_serving_amount: toOptionalNumber(item?.metric_serving_amount),
  metric_serving_unit: item?.metric_serving_unit || undefined,
  food_type: item?.food_type || null,
  brand_name: item?.brand_name || null,
  image: item?.image || "",
  // Same server-verdict passthrough as normalizeMealPayload (Fix B).
  image_lookup_state: (String(item?.image || "").trim()
    ? "resolved"
    : item?.image_lookup_state === "unavailable"
      ? "unavailable"
      : "pending") as ImageLookupState,
  image_lookup_source: String(item?.image || "").trim() ? "payload" : null,
  });
};

const createEmptyImageHydrationStats = (): ImageHydrationStats => ({
  totalCount: 0,
  resolvedCount: 0,
  pendingCount: 0,
  unavailableCount: 0,
  missingCount: 0,
});

const normalizeImageLookupItems = (items: any[], finalizeMissing = false): any[] =>
  ensureArray(items).map((entry: any) => {
    if (Array.isArray(entry?.items) && entry.items.length > 0) {
      return {
        ...entry,
        items: normalizeImageLookupItems(entry.items, finalizeMissing),
      };
    }

    const image = String(entry?.image || "").trim();
    const currentState: ImageLookupState =
      entry?.image_lookup_state === "unavailable"
        ? "unavailable"
        : entry?.image_lookup_state === "resolved"
          ? "resolved"
          : "pending";
    const nextState: ImageLookupState = image ? "resolved" : finalizeMissing ? "unavailable" : currentState;

    return {
      ...entry,
      image_lookup_state: nextState,
      image_lookup_source:
        nextState === "resolved"
          ? entry?.image_lookup_source || (image ? "payload" : null)
          : entry?.image_lookup_source || null,
    };
  });

const summarizeImageLookupItems = (items: any[]): ImageHydrationStats => {
  const summary = createEmptyImageHydrationStats();

  const visit = (entry: any) => {
    if (Array.isArray(entry?.items) && entry.items.length > 0) {
      entry.items.forEach(visit);
      return;
    }

    summary.totalCount += 1;
    const image = String(entry?.image || "").trim();
    const lookupState: ImageLookupState =
      entry?.image_lookup_state === "unavailable"
        ? "unavailable"
        : image
          ? "resolved"
          : "pending";

    if (image) {
      summary.resolvedCount += 1;
      return;
    }

    summary.missingCount += 1;
    if (lookupState === "pending") {
      summary.pendingCount += 1;
      return;
    }

    summary.unavailableCount += 1;
  };

  ensureArray(items).forEach(visit);
  return summary;
};

const mergeImageHydrationStats = (...stats: ImageHydrationStats[]): ImageHydrationStats =>
  stats.reduce(
    (accumulator, current) => ({
      totalCount: accumulator.totalCount + current.totalCount,
      resolvedCount: accumulator.resolvedCount + current.resolvedCount,
      pendingCount: accumulator.pendingCount + current.pendingCount,
      unavailableCount: accumulator.unavailableCount + current.unavailableCount,
      missingCount: accumulator.missingCount + current.missingCount,
    }),
    createEmptyImageHydrationStats()
  );

const finalizeImageLookupStates = (
  recommendationsByMeal: Record<MealType, any[]>,
  mostConsumedItems: any[]
) => ({
  recommendationsByMeal: {
    breakfast: normalizeImageLookupItems(recommendationsByMeal?.breakfast, true),
    lunch: normalizeImageLookupItems(recommendationsByMeal?.lunch, true),
    dinner: normalizeImageLookupItems(recommendationsByMeal?.dinner, true),
  },
  mostConsumedItems: normalizeImageLookupItems(mostConsumedItems, true),
});

const summarizeRecommendationImageHydration = (
  recommendationsByMeal: Record<MealType, any[]>,
  mostConsumedItems: any[]
) =>
  mergeImageHydrationStats(
    summarizeImageLookupItems(recommendationsByMeal?.breakfast),
    summarizeImageLookupItems(recommendationsByMeal?.lunch),
    summarizeImageLookupItems(recommendationsByMeal?.dinner),
    summarizeImageLookupItems(mostConsumedItems)
  );

const hasAnyRenderableRecommendations = (recommendationsByMeal: Record<MealType, any[]>) =>
  MEAL_TYPES.some((mealType) => ensureArray(recommendationsByMeal?.[mealType]).length > 0);

const shouldCacheRecommendationResult = (result: RecommendationResult) =>
  !!result?.ok &&
  (hasAnyRenderableRecommendations(result.recommendationsByMeal) || !!result?.payload?.used_safety_fallback);

const collectPrefetchImageUrls = (recommendationsByMeal: Record<MealType, any[]>) => {
  const urls: string[] = [];

  for (const mealType of MEAL_TYPES) {
    for (const entry of ensureArray(recommendationsByMeal?.[mealType])) {
      const items = Array.isArray(entry?.items) && entry.items.length > 0 ? entry.items : [entry];
      for (const item of items) {
        const image = String(item?.image || "").trim();
        if (!image || urls.includes(image)) continue;
        urls.push(image);
        if (urls.length >= RECOMMENDATION_IMAGE_PREFETCH_LIMIT) {
          return urls;
        }
      }
    }
  }

  return urls;
};

const prefetchRecommendationImages = (recommendationsByMeal: Record<MealType, any[]>) => {
  const urls = collectPrefetchImageUrls(recommendationsByMeal);
  if (urls.length === 0) return;

  void Promise.allSettled(urls.map((url) => RNImage.prefetch(url)));
};

// Image hydration is by far this app's heaviest network fan-out. A single item
// can fire ~20 FatSecret proxy calls on a cache miss (direct id lookup, then up
// to FOOD_IMAGE_QUERY_LIMIT searches each with detail checks), and a full meal
// planning screen hydrates 30+ items. Running those unthrottled had two effects
// on TestFlight (2026-07-20):
//   1. It saturated iOS's ~4-6 connections-per-host pool, so unrelated requests
//      queued behind it — the calorie summary took 5-8s to appear.
//   2. It burned the backend's per-IP rate limit in a single screen visit,
//      producing 429s on the next screen the user opened.
// The gate below caps how many item lookups run at once ACROSS every call site,
// so nesting (3 meals x N items) can no longer multiply into a burst. Total
// wall time barely changes — this work was always network-bound and already
// runs in the background via scheduleImageHydration — but nothing else starves.
const IMAGE_HYDRATION_CONCURRENCY = 3;

let activeImageHydrations = 0;
const imageHydrationQueue: (() => void)[] = [];

const acquireImageHydrationSlot = async () => {
  if (activeImageHydrations < IMAGE_HYDRATION_CONCURRENCY) {
    activeImageHydrations += 1;
    return;
  }
  // No increment on this path: a waiter inherits the releasing task's slot.
  await new Promise<void>((resolve) => imageHydrationQueue.push(resolve));
};

const releaseImageHydrationSlot = () => {
  const next = imageHydrationQueue.shift();
  if (next) {
    // Hand the slot straight to the next waiter instead of decrementing first.
    // Decrementing would leave the count below the cap for one microtask, which
    // is long enough for a newly-arriving task to claim it too and push actual
    // concurrency above IMAGE_HYDRATION_CONCURRENCY.
    next();
    return;
  }
  activeImageHydrations = Math.max(0, activeImageHydrations - 1);
};

const enrichItemsWithImages = async (
  items: any[],
  cap = 12,
  options: { forceFatSecretImage?: boolean } = {}
) => {
  const forceFatSecretImage = !!options.forceFatSecretImage;
  const output = [...items];
  const tasks = output
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (forceFatSecretImage) {
        return true;
      }
      // Skip items the server already stamped "unavailable" (Fix B): the backend
      // resolved what it could before sending the payload, so an imageless item
      // with a terminal state is a settled miss, not work left for the device.
      if (item?.image_lookup_state === "unavailable") {
        return false;
      }
      return !String(item?.image || "").trim();
    })
    .slice(0, cap);

  await Promise.all(
    tasks.map(async ({ item, index }) => {
      await acquireImageHydrationSlot();
      try {
        const resolved = await resolveFoodImageFromFatSecret(item, {
          preferFatSecretImage: forceFatSecretImage,
        });
        const nextImage = String(resolved?.image || output[index]?.image || "").trim();
        output[index].image = nextImage;
        output[index].image_lookup_state = nextImage
          ? "resolved"
          : resolved?.lookupState === "unavailable"
            ? "unavailable"
            : "pending";
        output[index].image_lookup_source = resolved?.source || output[index]?.image_lookup_source || null;
        if (resolved?.food_id && !output[index].fatsecret_food_id) {
          output[index].fatsecret_food_id = String(resolved.food_id);
        }
        if (resolved?.food_id && !output[index].food_id) {
          output[index].food_id = String(resolved.food_id);
        }
      } catch {
        output[index].image_lookup_state = "unavailable";
      } finally {
        releaseImageHydrationSlot();
      }
    })
  );

  return output;
};

const enrichCombosWithImages = async (combos: any[]) => {
  if (!Array.isArray(combos) || combos.length === 0) return [];
  return Promise.all(
    combos.map(async (combo) => {
      const items = ensureArray(combo?.items);
      if (items.length === 0) return combo;
      const enrichedItems = await enrichItemsWithImages(items, 3);
      return { ...combo, items: enrichedItems };
    })
  );
};

const enrichRecommendationMealImages = async (recommendationsByMeal: Record<MealType, any[]>) => {
  const resolveMeal = async (items: any[]) => {
    const first = ensureArray(items)[0];
    if (first && Array.isArray(first?.items)) {
      return enrichCombosWithImages(ensureArray(items));
    }
    return enrichItemsWithImages(ensureArray(items), 10);
  };

  const [breakfast, lunch, dinner] = await Promise.all([
    resolveMeal(recommendationsByMeal?.breakfast),
    resolveMeal(recommendationsByMeal?.lunch),
    resolveMeal(recommendationsByMeal?.dinner),
  ]);

  return {
    breakfast,
    lunch,
    dinner,
  };
};

const enrichRecommendationImages = async (recommendationsByMeal: Record<MealType, any[]>, mostConsumedItems: any[]) => {
  const [enrichedRecommendationsByMeal, enrichedMostConsumed] = await Promise.all([
    enrichRecommendationMealImages(recommendationsByMeal),
    enrichItemsWithImages(ensureArray(mostConsumedItems), MOST_CONSUMED_IMAGE_HYDRATION_LIMIT),
  ]);

  return {
    recommendationsByMeal: enrichedRecommendationsByMeal,
    mostConsumedItems: enrichedMostConsumed,
  };
};

const buildRecommendationResult = ({
  ok,
  status,
  payload,
  recommendationsByMeal,
  mostConsumedItems,
  dailyCalorieTarget,
  mealCalorieTargets,
  source,
  usedCachedFallback = false,
  cacheAgeMs = 0,
  imageHydrationState,
  finalizeImageLookup = false,
}: {
  ok: boolean;
  status: number;
  payload: any;
  recommendationsByMeal: Record<MealType, any[]>;
  mostConsumedItems: any[];
  dailyCalorieTarget: number;
  mealCalorieTargets: Record<string, any>;
  source: RecommendationSource;
  usedCachedFallback?: boolean;
  cacheAgeMs?: number;
  imageHydrationState?: ImageHydrationState;
  finalizeImageLookup?: boolean;
}): RecommendationResult => {
  let nextRecommendationsByMeal = recommendationsByMeal;
  let nextMostConsumedItems = mostConsumedItems;

  if (finalizeImageLookup) {
    const finalized = finalizeImageLookupStates(recommendationsByMeal, mostConsumedItems);
    nextRecommendationsByMeal = finalized.recommendationsByMeal;
    nextMostConsumedItems = finalized.mostConsumedItems;
  }

  const imageHydrationStats = summarizeRecommendationImageHydration(nextRecommendationsByMeal, nextMostConsumedItems);
  const resolvedImageHydrationState =
    imageHydrationState ||
    (imageHydrationStats.pendingCount > 0
      ? "running"
      : imageHydrationStats.totalCount > 0
        ? "complete"
        : "idle");

  return {
    ok,
    status,
    payload,
    recommendationsByMeal: nextRecommendationsByMeal,
    mostConsumedItems: nextMostConsumedItems,
    dailyCalorieTarget,
    mealCalorieTargets,
    imageHydrationPending: resolvedImageHydrationState === "running",
    imageHydrationState: resolvedImageHydrationState,
    imageHydrationStats,
    stage: resolvedImageHydrationState === "running" ? "base" : "hydrated",
    source,
    usedCachedFallback,
    cacheAgeMs,
  };
};

const fetchNetworkRecommendationResult = async ({
  url,
  cacheKey,
  getToken,
  clerkId,
}: {
  url: string;
  cacheKey: string;
  getToken?: GetToken;
  clerkId?: string | null;
}): Promise<RecommendationResult> => {
  const requestStartedAt = Date.now();
  const response = await authedFetch(url, { getToken, clerkId });
  const payload = await response.json();
  const normalizedByMeal = normalizeRecommendationsByMeal(payload);
  const normalizedMostConsumed = ensureArray(payload?.most_consumed_items).map((item: any) => normalizeMostConsumedItem(item));
  const result = buildRecommendationResult({
    ok: response.ok,
    status: response.status,
    payload,
    recommendationsByMeal: normalizedByMeal,
    mostConsumedItems: normalizedMostConsumed,
    dailyCalorieTarget: Math.max(0, Math.round(toNumber(payload?.daily_calorie_target, 0))),
    mealCalorieTargets: payload?.meal_calorie_targets || {},
    source: "network",
  });
  const elapsedMs = Date.now() - requestStartedAt;

  if (shouldCacheRecommendationResult(result)) {
    setCachedRecommendationResult(cacheKey, result);
  }
  if (result.ok) {
    prefetchRecommendationImages(result.recommendationsByMeal);
  }

  console.log("[recommendation.ts] fetched recommendation payload", {
    ok: response.ok,
    status: response.status,
    elapsedMs,
    hasRenderableRecommendations: hasAnyRenderableRecommendations(result.recommendationsByMeal),
    imageHydrationState: result.imageHydrationState,
    pendingImages: result.imageHydrationStats.pendingCount,
    cacheStored: shouldCacheRecommendationResult(result),
  });

  return result;
};

const scheduleImageHydration = (
  cacheKey: string,
  baseResult: RecommendationResult,
  onUpdate?: (result: RecommendationResult) => void
) => {
  if (!baseResult.imageHydrationPending) {
    return;
  }

  const existingHydration = inFlightRecommendationHydrations.get(cacheKey);
  const shouldReuseExistingHydration =
    !!existingHydration && !(baseResult.source === "network" && existingHydration.source === "cache");

  let hydrationPromise: Promise<RecommendationResult>;
  if (shouldReuseExistingHydration) {
    hydrationPromise = existingHydration.promise;
  } else {
    const hydrationStartedAt = Date.now();
    hydrationPromise = (async () => {
      try {
        const enrichedRecommendationsByMeal = await enrichRecommendationMealImages(baseResult.recommendationsByMeal);
        const hasPendingMostConsumed = summarizeImageLookupItems(baseResult.mostConsumedItems).pendingCount > 0;

        if (hasPendingMostConsumed && onUpdate) {
          // Push visible meal-card images first so slower strip hydration does not hold back the main screen.
          onUpdate(buildRecommendationResult({
            ...baseResult,
            recommendationsByMeal: enrichedRecommendationsByMeal,
            mostConsumedItems: baseResult.mostConsumedItems,
            source: baseResult.source,
            usedCachedFallback: baseResult.usedCachedFallback,
            cacheAgeMs: baseResult.cacheAgeMs,
            imageHydrationState: "running",
          }));
        }

        const enrichedMostConsumed = hasPendingMostConsumed
          ? await enrichItemsWithImages(ensureArray(baseResult.mostConsumedItems), MOST_CONSUMED_IMAGE_HYDRATION_LIMIT)
          : baseResult.mostConsumedItems;
        const hydratedResult = buildRecommendationResult({
          ...baseResult,
          recommendationsByMeal: enrichedRecommendationsByMeal,
          mostConsumedItems: enrichedMostConsumed,
          source: baseResult.source,
          usedCachedFallback: baseResult.usedCachedFallback,
          cacheAgeMs: baseResult.cacheAgeMs,
          imageHydrationState: "complete",
          finalizeImageLookup: true,
        });
        const elapsedMs = Date.now() - hydrationStartedAt;

        if (baseResult.source === "network" && !baseResult.usedCachedFallback) {
          setCachedRecommendationResult(cacheKey, hydratedResult);
        }
        prefetchRecommendationImages(hydratedResult.recommendationsByMeal);

        console.log("[recommendation.ts] hydrated recommendation images", {
          elapsedMs,
          source: baseResult.source,
          unresolvedImages: hydratedResult.imageHydrationStats.unavailableCount,
        });

        return hydratedResult;
      } catch (error) {
        const terminalResult = buildRecommendationResult({
          ...baseResult,
          source: baseResult.source,
          usedCachedFallback: baseResult.usedCachedFallback,
          cacheAgeMs: baseResult.cacheAgeMs,
          imageHydrationState: "complete",
          finalizeImageLookup: true,
        });

        if (baseResult.source === "network" && !baseResult.usedCachedFallback) {
          setCachedRecommendationResult(cacheKey, terminalResult);
        }

        console.warn("[recommendation.ts] image hydration failed", {
          error,
          source: baseResult.source,
          elapsedMs: Date.now() - hydrationStartedAt,
        });
        return terminalResult;
      }
    })().finally(() => {
      const currentHydration = inFlightRecommendationHydrations.get(cacheKey);
      if (currentHydration?.promise === hydrationPromise) {
        inFlightRecommendationHydrations.delete(cacheKey);
      }
    });

    inFlightRecommendationHydrations.set(cacheKey, {
      promise: hydrationPromise,
      source: baseResult.source,
    });
  }

  if (onUpdate) {
    void hydrationPromise
      .then((hydratedResult) => {
        onUpdate(hydratedResult);
      })
      .catch((error) => {
        console.warn("[recommendation.ts] image hydration failed", error);
      });
  }
};

export const fetchRecommendations = async ({
  apiURL,
  userId,
  mealType = "all",
  forceExploration = false,
  timeoutMs = RECOMMENDATION_FETCH_TIMEOUT_MS,
  onUpdate,
  getToken,
}: RecommendationFetchArgs = {}) => {
  if (!apiURL || !userId) throw new Error("Missing apiURL or userId");

  const params = new URLSearchParams();
  if (mealType && mealType !== "all") params.set("mealType", mealType);
  if (forceExploration) params.set("force_exploration", "true");
  const query = params.toString();
  const url = `${apiURL}/api/recommendation/${userId}${query ? `?${query}` : ""}`;
  const cacheKey = buildRecommendationCacheKey(apiURL, userId, mealType, forceExploration);
  const callStartedAt = Date.now();
  const cacheReadyPromise = ensureRecommendationCacheReady();
  const networkPromise = getOrStartRecommendationRequest({ url, cacheKey, getToken, clerkId: userId });
  await cacheReadyPromise;
  const cachedPayload = getCachedRecommendationResult(cacheKey);

  console.log("[recommendation.ts] starting recommendation fetch", {
    mealType,
    forceExploration,
    hasCache: !!cachedPayload,
  });

  if (!cachedPayload) {
    const timeoutPromise = new Promise<typeof FETCH_TIMEOUT_SENTINEL>((resolve) => {
      setTimeout(() => resolve(FETCH_TIMEOUT_SENTINEL), timeoutMs);
    });

    const raced = await Promise.race([networkPromise, timeoutPromise]);
    if (raced !== FETCH_TIMEOUT_SENTINEL && raced) {
      if (raced.ok) {
        scheduleImageHydration(cacheKey, raced, onUpdate);
      }
      console.log("[recommendation.ts] returning first-load network recommendation payload", {
        elapsedMs: Date.now() - callStartedAt,
        stage: raced.stage,
      });
      return raced;
    }

    void networkPromise.then((freshResult) => {
      if (!freshResult?.ok) return;
      onUpdate?.(freshResult);
      console.log("[recommendation.ts] first-load network returned after safety fallback", {
        elapsedMs: Date.now() - callStartedAt,
        stage: freshResult.stage,
      });
      scheduleImageHydration(cacheKey, freshResult, onUpdate);
    });

    const safetyResult = buildFrontendSafetyResult(mealType, "initial_timeout");
    console.warn("[recommendation.ts] returning first-load safety fallback", {
      timeoutMs,
      elapsedMs: Date.now() - callStartedAt,
      reason: "initial_timeout",
    });
    return safetyResult;
  }

  const timeoutPromise = new Promise<typeof FETCH_TIMEOUT_SENTINEL>((resolve) => {
    setTimeout(() => resolve(FETCH_TIMEOUT_SENTINEL), timeoutMs);
  });

  const raced = await Promise.race([networkPromise, timeoutPromise]);
  if (raced !== FETCH_TIMEOUT_SENTINEL && raced) {
    if (raced.ok) {
      scheduleImageHydration(cacheKey, raced, onUpdate);
      console.log("[recommendation.ts] network returned before cache fallback timeout", {
        elapsedMs: Date.now() - callStartedAt,
        stage: raced.stage,
      });
      return raced;
    }

    console.warn("[recommendation.ts] network returned non-ok before cache fallback timeout; preserving cached result", {
      status: raced.status,
      elapsedMs: Date.now() - callStartedAt,
    });
  }

  void networkPromise.then((freshResult) => {
    if (!freshResult?.ok) return;
    onUpdate?.(freshResult);
    console.log("[recommendation.ts] network returned after cached fallback", {
      elapsedMs: Date.now() - callStartedAt,
      stage: freshResult.stage,
    });
    scheduleImageHydration(cacheKey, freshResult, onUpdate);
  });

  const cachedResult = buildRecommendationResult({
    ...cachedPayload.result,
    source: "cache",
    usedCachedFallback: true,
    cacheAgeMs: cachedPayload.cacheAgeMs,
  });
  if (cachedResult.imageHydrationPending) {
    scheduleImageHydration(cacheKey, cachedResult, onUpdate);
  }

  console.log("[recommendation.ts] returning cached recommendation fallback", {
    cacheAgeMs: cachedPayload.cacheAgeMs,
    timeoutMs,
    elapsedMs: Date.now() - callStartedAt,
  });

  return cachedResult;
};

export const sendRecommendationFeedback = async ({
  apiURL,
  clerkId,
  comboId,
  mealType,
  status,
  ml_tag,
  explanation,
  itemTitle,
  itemTitles,
  getToken,
}: FeedbackArgs = {}) => {
  if (!apiURL || !clerkId || !comboId || !status) return false;
  const normalizedStatus = String(status).trim();
  if (!["Accepted", "Rejected", "Loved", "Skipped"].includes(normalizedStatus)) return false;

  try {
    const response = await authedFetch(`/api/recommendation/feedback`, {
      method: "POST",
      baseUrl: apiURL,
      getToken,
      clerkId,
      body: JSON.stringify({
        clerkId,
        comboId,
        mealType,
        status: normalizedStatus,
        ml_tag: ml_tag || null,
        explanation: explanation || null,
        itemTitle: itemTitle || null,
        itemTitles: itemTitles || null,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const getPrimeRecommendationStatus = async ({
  apiURL,
  clerkId,
  mealType = "all",
  getToken,
}: PrimeStatusArgs = {}): Promise<PrimeWarmupResult | null> => {
  if (!apiURL || !clerkId) return null;

  return getOrStartPrimeStatusRequest({
    requestKey: buildPrimeStatusRequestKey({ apiURL, clerkId, mealType }),
    url: buildPrimeStatusUrl(apiURL, clerkId, mealType),
    getToken,
    clerkId,
  });
};

export const primeRecommendationsDetailed = async ({
  apiURL,
  clerkId,
  userId,
  demographics,
  mealType = "all",
  waitForWarmup = false,
  waitTimeoutMs,
  getToken,
}: PrimeArgs = {}): Promise<PrimeWarmupResult | null> => {
  if (!apiURL || (!clerkId && !userId)) return null;

  return getOrStartPrimeRequest({
    requestKey: buildPrimeRequestKey({
      apiURL,
      clerkId,
      userId,
      demographics,
      mealType,
      waitForWarmup,
      waitTimeoutMs,
    }),
    apiURL,
    getToken,
    body: {
      clerkId: clerkId || null,
      userId: userId || null,
      demographics: demographics || null,
      mealType,
      waitForWarmup,
      waitTimeoutMs: waitTimeoutMs ?? null,
    },
  });
};

export const primeRecommendations = async ({
  apiURL,
  clerkId,
  userId,
  demographics,
  mealType = "all",
  waitForWarmup = false,
  waitTimeoutMs,
  getToken,
}: PrimeArgs = {}) => {
  const result = await primeRecommendationsDetailed({
    apiURL,
    clerkId,
    userId,
    demographics,
    mealType,
    waitForWarmup,
    waitTimeoutMs,
    getToken,
  });

  if (!result?.ok) {
    return false;
  }

  if (result.primed || result.queued) return true;
  if (PRIME_SUCCESS_REASONS.has(result.reason)) return true;
  return false;
};
