import AsyncStorage from '@react-native-async-storage/async-storage';

type MacroSet = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

type HomeMacroState = {
  consumed: MacroSet;
  target: MacroSet;
};

type HomeSnapshot = {
  dbUserName: string;
  macros: HomeMacroState | null;
  foodItems: any[];
  foodItemsMealPeriod: string | null;
  dashboardFetchedAt: number;
  foodItemsFetchedAt: number;
};

const homeByUser = new Map<string, HomeSnapshot>();
const HOME_FOOD_ITEMS_STORAGE_KEY_PREFIX = 'meal-app:home-food-items:v1:';
const STALE_TIME_BASED_RECOMMENDATION_QUERIES = new Set([
  'breakfast',
  'healthy lunch',
  'healthy dinner',
  'healthy snack',
  'fruit',
]);
const INVALID_TIME_BASED_RECOMMENDATION_TERMS = [
  'alcohol',
  'alcoholic',
  'beverage',
  'drink',
  'fruit punch',
  'juice',
  'punch',
  'soda',
];

const isInvalidCachedFoodItem = (item: any) => {
  const id = String(item?.id || item?.food_id || '').trim();
  const source = String(item?.source || '').trim().toLowerCase();
  const recommendationQuery = String(item?.recommendationQuery || '').trim().toLowerCase();
  const isTimeBasedRecommendation = Boolean(item?.isTimeBasedRecommendation || item?.recommendationMealPeriod);
  const searchableText = [
    item?.title,
    item?.description,
    item?.food_type,
    item?.brand,
    item?.brand_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    id.startsWith('local-') ||
    source === 'local_catalog' ||
    (isTimeBasedRecommendation && STALE_TIME_BASED_RECOMMENDATION_QUERIES.has(recommendationQuery)) ||
    (isTimeBasedRecommendation && !String(item?.image || '').trim()) ||
    (isTimeBasedRecommendation && INVALID_TIME_BASED_RECOMMENDATION_TERMS.some((term) => searchableText.includes(term)))
  );
};
const hasInvalidCachedFoodItems = (items: any[] = []) => items.some((item) => isInvalidCachedFoodItem(item));

const cloneMacros = (macros: HomeMacroState | null) =>
  macros
    ? {
        consumed: { ...macros.consumed },
        target: { ...macros.target },
      }
    : null;

const normalizeFoodTitleKey = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getFoodItemDedupeKey = (item: any) => {
  const titleKey = normalizeFoodTitleKey(item?.title || item?.food_name);
  if (titleKey) return `title:${titleKey}`;

  const idKey = String(item?.fatsecret_food_id || item?.food_id || item?.id || '').trim();
  return idKey ? `id:${idKey}` : '';
};

const dedupeFoodItems = (items: any[] = []) => {
  const output: any[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const key = getFoodItemDedupeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
};

const cloneItems = (items: any[]) => dedupeFoodItems(items).map((item) => ({ ...item }));

const getHomeFoodItemsStorageKey = (userId: string) =>
  `${HOME_FOOD_ITEMS_STORAGE_KEY_PREFIX}${userId}`;

const readPersistedHomeFoodItems = async (userId: string) => {
  try {
    const raw = await AsyncStorage.getItem(getHomeFoodItemsStorageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const foodItems = Array.isArray(parsed?.foodItems) ? parsed.foodItems : [];
    if (!foodItems.length || hasInvalidCachedFoodItems(foodItems)) return null;

    return {
      foodItems: cloneItems(foodItems),
      foodItemsMealPeriod: String(parsed?.foodItemsMealPeriod || '') || null,
      foodItemsFetchedAt: Number(parsed?.foodItemsFetchedAt) || 0,
    };
  } catch {
    return null;
  }
};

const persistHomeFoodItems = async (
  userId: string,
  payload: {
    foodItems: any[];
    foodItemsMealPeriod: string | null;
    foodItemsFetchedAt: number;
  }
) => {
  try {
    await AsyncStorage.setItem(
      getHomeFoodItemsStorageKey(userId),
      JSON.stringify({
        foodItems: cloneItems(payload.foodItems),
        foodItemsMealPeriod: payload.foodItemsMealPeriod,
        foodItemsFetchedAt: payload.foodItemsFetchedAt,
      })
    );
  } catch {
    // Persisted Home recommendations are a performance cache only.
  }
};

export const getCachedHomeSnapshot = (userId?: string | null): HomeSnapshot | null => {
  if (!userId) return null;
  const snapshot = homeByUser.get(userId);
  if (!snapshot) return null;
  const invalidFoodItems = hasInvalidCachedFoodItems(snapshot.foodItems);
  return {
    dbUserName: snapshot.dbUserName,
    macros: cloneMacros(snapshot.macros),
    foodItems: invalidFoodItems ? [] : cloneItems(snapshot.foodItems),
    foodItemsMealPeriod: invalidFoodItems ? null : snapshot.foodItemsMealPeriod,
    dashboardFetchedAt: snapshot.dashboardFetchedAt,
    foodItemsFetchedAt: invalidFoodItems ? 0 : snapshot.foodItemsFetchedAt,
  };
};

export const hydrateHomeFoodItemsFromStorage = async (
  userId?: string | null
): Promise<HomeSnapshot | null> => {
  if (!userId) return null;
  const persisted = await readPersistedHomeFoodItems(userId);
  if (!persisted) return null;

  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName: current?.dbUserName || '',
    macros: cloneMacros(current?.macros || null),
    foodItems: persisted.foodItems,
    foodItemsMealPeriod: persisted.foodItemsMealPeriod,
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
    foodItemsFetchedAt: persisted.foodItemsFetchedAt,
  });

  return getCachedHomeSnapshot(userId);
};

export const setCachedHomeDashboard = (
  userId: string,
  payload: { dbUserName: string; macros: HomeMacroState }
) => {
  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName: payload.dbUserName,
    macros: cloneMacros(payload.macros),
    foodItems: cloneItems(current?.foodItems || []),
    foodItemsMealPeriod: current?.foodItemsMealPeriod || null,
    dashboardFetchedAt: Date.now(),
    foodItemsFetchedAt: current?.foodItemsFetchedAt || 0,
  });
};

export const setCachedHomeUserName = (userId: string, dbUserName: string) => {
  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName,
    macros: cloneMacros(current?.macros || null),
    foodItems: cloneItems(current?.foodItems || []),
    foodItemsMealPeriod: current?.foodItemsMealPeriod || null,
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
    foodItemsFetchedAt: current?.foodItemsFetchedAt || 0,
  });
};

export const setCachedHomeFoodItems = (userId: string, foodItems: any[], mealPeriod?: string | null) => {
  const current = homeByUser.get(userId);
  const fetchedAt = Date.now();
  const clonedItems = cloneItems(foodItems || []);
  const normalizedMealPeriod = mealPeriod || null;
  homeByUser.set(userId, {
    dbUserName: current?.dbUserName || '',
    macros: cloneMacros(current?.macros || null),
    foodItems: clonedItems,
    foodItemsMealPeriod: normalizedMealPeriod,
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
    foodItemsFetchedAt: fetchedAt,
  });

  void persistHomeFoodItems(userId, {
    foodItems: clonedItems,
    foodItemsMealPeriod: normalizedMealPeriod,
    foodItemsFetchedAt: fetchedAt,
  });
};

export const shouldRefreshHomeDashboard = (userId?: string | null, maxAgeMs = 15_000) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.macros) return true;
  return Date.now() - snapshot.dashboardFetchedAt > maxAgeMs;
};

export const shouldRefreshHomeFoodItems = (
  userId?: string | null,
  maxAgeMs = 30 * 60_000,
  currentMealPeriod?: string | null
) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.foodItems?.length) return true;
  if (hasInvalidCachedFoodItems(snapshot.foodItems)) return true;
  const cachedMealPeriod = snapshot.foodItemsMealPeriod || snapshot.foodItems[0]?.recommendationMealPeriod || null;
  if (currentMealPeriod && cachedMealPeriod !== currentMealPeriod) return true;
  return Date.now() - snapshot.foodItemsFetchedAt > maxAgeMs;
};
