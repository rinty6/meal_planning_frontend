// This file acts as the api communicator
// Collect recipes and foods' details and then send to the frontend

import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateMealCombosWithResolvers } from './mealAPI.combos';


const BACKEND_API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const DEFAULT_RECIPE_SEARCH_QUERY = 'healthy';

type ImageLookupSource =
  | 'existing'
  | 'food-detail'
  | 'food-search'
  | 'recipe-search'
  | 'miss';

type ImageLookupState = 'resolved' | 'unavailable';

type CachedImageLookupEntry = {
  image: string;
  food_id: string | null;
  recipe_id: string | null;
  source: ImageLookupSource;
  state: ImageLookupState;
  cachedAt: number;
  expiresAt: number;
};

type ResolvedImageLookup = {
  image: string;
  food_id: string | null;
  recipe_id?: string | null;
  lookupState: ImageLookupState;
  source: ImageLookupSource;
  cacheHit?: boolean;
};

type FoodDetailFactsResult = {
  item: any;
  nutritionFacts: ReturnType<typeof buildNutritionFactsFromFood>;
};

// Bump the cache version so expanded alias queries can replay older cached misses.
const IMAGE_LOOKUP_CACHE_STORAGE_KEY = 'meal-app:fatsecret-image-cache:v3';
const IMAGE_LOOKUP_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const IMAGE_LOOKUP_MISS_TTL_MS = 1000 * 60 * 60 * 12;
const IMAGE_LOOKUP_CACHE_MAX_ENTRIES = 250;
const FOOD_DETAIL_FACTS_CACHE_TTL_MS = 1000 * 60 * 10;
const FOOD_IMAGE_QUERY_LIMIT = 3;
const RECIPE_IMAGE_QUERY_LIMIT = 2;
// Guard title fallback so local items do not hydrate detail facts from unrelated foods.
const TITLE_FALLBACK_MIN_SIMILARITY = 0.34;
const BRAND_PREFIXES = new Set([
  'mcdonald',
  'mcdonalds',
  'kfc',
  'burger king',
  'sonic',
  'subway',
  'starbucks',
  'taco bell',
  'wendy',
  'ihop',
  'domino',
  'pizza hut',
  'papa johns',
  'dunkin',
]);
const PREPARED_DISH_KEYWORDS = [
  'bowl',
  'salad',
  'sandwich',
  'wrap',
  'toast',
  'soup',
  'stir fry',
  'fried',
  'roast',
  'grilled',
  'pasta',
  'rice',
  'noodle',
  'burger',
  'pizza',
  'pho',
  'curry',
  'taco',
];
const SINGLE_WORD_MAIN_DISH_KEYWORDS = [
  'omelette',
  'omelet',
  'scramble',
  'scrambled',
  'rancheros',
  'burrito',
  'quesadilla',
  'pancake',
  'waffle',
];
const NON_ENGLISH_LOOKUP_MARKERS = [
  'banane',
  'brebis',
  'chataigne',
  'eier',
  'frische',
  'framboise',
  'fromage blanc',
  'griego',
  'groente',
  'joghurt',
  'jogurt',
  'knickis',
  'knicks',
  'knusper',
  'komkommer',
  'myrtille',
  'spinazie',
  'yaourt',
];

let hasLoadedImageLookupCache = false;
let imageLookupCacheReadyPromise: Promise<void> | null = null;
let imageLookupCachePersistTimer: ReturnType<typeof setTimeout> | null = null;

const ensureArray = (value: any) => (Array.isArray(value) ? value : value ? [value] : []);
const imageLookupCache = new Map<string, CachedImageLookupEntry>();
const foodDetailFactsCache = new Map<string, { savedAt: number; value: FoodDetailFactsResult }>();
const inFlightFoodDetailFactsRequests = new Map<string, Promise<FoodDetailFactsResult | null>>();
const cleanId = (value: any) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};
const toNumeric = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeWhitespace = (value: any) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeLookupKey = (value: any) => normalizeWhitespace(value).toLowerCase();
const hasAnyLookupMarker = (text: string, markers: string[]) =>
  markers.some((marker) => text.includes(marker));
const isEnglishLikeLookupTitle = (value: any) => {
  const text = normalizeWhitespace(value);
  if (!text || !/[A-Za-z]/.test(text)) return false;
  const normalized = normalizeLookupKey(text);
  if (NON_ENGLISH_LOOKUP_MARKERS.some((marker) => normalized.includes(marker))) {
    return false;
  }
  return true;
};
const dedupeStrings = (values: any[], limit = 8) => {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }

  return output;
};
const tokenizeLookupTitle = (value: any) =>
  normalizeLookupKey(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
const computeTitleSimilarity = (left: any, right: any) => {
  const leftTokens = new Set(tokenizeLookupTitle(left));
  const rightTokens = new Set(tokenizeLookupTitle(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return intersection / Math.max(leftTokens.size, rightTokens.size);
};
const stripTitleDecorators = (value: any) =>
  normalizeWhitespace(String(value || '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '));
const stripBrandPrefix = (query: string, explicitBrand = '') => {
  let text = normalizeWhitespace(query);
  if (!text) return '';

  const commaIndex = text.indexOf(',');
  if (commaIndex > -1 && !text.includes('(')) {
    text = text.slice(commaIndex + 1).trim();
  }
  if (text.includes(' - ')) {
    text = text.split(' - ', 2)[1]?.trim() || text;
  }
  if (text.includes(':')) {
    text = text.split(':', 2)[1]?.trim() || text;
  }

  const normalizedBrand = normalizeLookupKey(explicitBrand);
  if (normalizedBrand) {
    const normalizedText = normalizeLookupKey(text);
    if (normalizedText.startsWith(`${normalizedBrand} `)) {
      text = text.slice(explicitBrand.length).replace(/^[,:-]\s*/, '').trim();
    }
  }

  const normalized = normalizeLookupKey(text);
  for (const brand of BRAND_PREFIXES) {
    if (normalized.startsWith(`${brand} `)) {
      text = text.slice(brand.length).trim();
      break;
    }
  }
  return normalizeWhitespace(text);
};
const buildCategoryFallbackQueries = (item: any) => {
  const category = normalizeLookupKey(item?.category || '');
  const searchableText = normalizeLookupKey([
    item?.canonical_title,
    item?.mapped_canonical_title,
    item?.mapped_title,
    item?.title,
    item?.original_title,
  ].filter(Boolean).join(' '));
  const fallbacks: string[] = [];

  if (category.includes('drink')) {
    // Promote generic drink aliases so async hydration can recover branded plant-milk misses.
    if (hasAnyLookupMarker(searchableText, ['soy', 'soya', 'soymilk'])) {
      fallbacks.push('Soy Milk');
      fallbacks.push('Soy Beverage');
    }
    if (hasAnyLookupMarker(searchableText, ['almond'])) {
      fallbacks.push('Almond Milk Drink');
      fallbacks.push('Almond Milk');
      fallbacks.push('Almond Beverage');
    }
    if (hasAnyLookupMarker(searchableText, ['oat'])) {
      fallbacks.push('Oat Milk');
      fallbacks.push('Oat Beverage');
    }
    if (searchableText.includes('iced coffee')) {
      fallbacks.push('Iced Coffee Drink');
      fallbacks.push('Ready to Drink Coffee');
    }
    if (searchableText.includes('cold brew')) {
      fallbacks.push('Cold Brew Coffee');
    }
    if (searchableText.includes('latte macchiato')) {
      fallbacks.push('Latte Macchiato');
    }
    if (searchableText.includes('macchiato')) {
      fallbacks.push('Macchiato');
    }
    if (searchableText.includes('espresso')) {
      fallbacks.push('Espresso');
    }
    if (searchableText.includes('latte')) {
      fallbacks.push('Latte');
    }
    if (searchableText.includes('coffee') || searchableText.includes('brew')) {
      fallbacks.push('Coffee');
    }
    if (searchableText.includes('tea')) {
      fallbacks.push('Tea');
    }
    if (searchableText.includes('juice')) {
      fallbacks.push('Juice');
    }
    if (searchableText.includes('smoothie')) {
      fallbacks.push('Smoothie');
    }
  }

  if (category.includes('side')) {
    if (hasAnyLookupMarker(searchableText, ['mixed berries', 'berries', 'berry mix'])) {
      fallbacks.push('Berries');
      fallbacks.push('Fresh Berries');
    }
    if (
      searchableText.includes('yogurt') ||
      searchableText.includes('yoghurt') ||
      searchableText.includes('jogurt') ||
      searchableText.includes('joghurt')
    ) {
      fallbacks.push('Greek Yogurt');
      fallbacks.push('Yogurt');
    }
  }

  if (category.includes('main')) {
    if (searchableText.includes('omelette') || searchableText.includes('omelet')) {
      fallbacks.push('Omelette');
    }
  }

  return dedupeStrings(fallbacks, 4);
};
const buildImageSearchQueries = (item: any) => {
  const title = normalizeWhitespace(item?.title || item?.food_name || '');
  const originalTitle = normalizeWhitespace(item?.original_title || '');
  const canonicalTitle = normalizeWhitespace(item?.canonical_title || '');
  const mappedTitle = normalizeWhitespace(item?.mapped_title || '');
  const mappedCanonicalTitle = normalizeWhitespace(item?.mapped_canonical_title || '');
  const brand = normalizeWhitespace(item?.brand_name || item?.brand || '');
  const stripped = stripBrandPrefix(title, brand);
  const strippedDecorators = stripTitleDecorators(title);
  const strippedAll = stripBrandPrefix(strippedDecorators, brand);
  const titleWithoutBrandName =
    brand && normalizeLookupKey(title).startsWith(`${normalizeLookupKey(brand)} `)
      ? normalizeWhitespace(title.slice(brand.length).replace(/^[,:-]\s*/, ''))
      : '';
  const categoryFallbackQueries = buildCategoryFallbackQueries(item);
  const prioritizedQueries = [
    canonicalTitle,
    mappedCanonicalTitle,
    mappedTitle,
    ...categoryFallbackQueries,
    title,
    stripped,
    strippedDecorators,
    strippedAll,
    titleWithoutBrandName,
  ].filter(Boolean);
  const hasPreferredEnglishQuery = prioritizedQueries.some((query) => isEnglishLikeLookupTitle(query));
  const shouldKeepOriginalTitle =
    !!originalTitle &&
    (
      prioritizedQueries.length === 0 ||
      prioritizedQueries.some((query) => normalizeLookupKey(query) === normalizeLookupKey(originalTitle)) ||
      (isEnglishLikeLookupTitle(originalTitle) && !hasPreferredEnglishQuery)
    );

  return dedupeStrings([
    ...prioritizedQueries,
    ...categoryFallbackQueries,
    shouldKeepOriginalTitle ? originalTitle : '',
  ], 6);
};
const buildImageLookupKeys = (rawId: string, queries: string[]) => {
  const keys: string[] = [];
  if (rawId && !rawId.startsWith('local-')) {
    keys.push(`id:${rawId}`);
  }
  for (const query of queries) {
    const normalized = normalizeLookupKey(query);
    if (!normalized) continue;
    keys.push(`title:${normalized}`);
  }
  return dedupeStrings(keys, 10);
};
const buildFoodDetailFactsCacheKey = (item: any, allowTitleFallback: boolean) => {
  const explicitFatSecretId = cleanId(item?.fatsecret_food_id);
  const fallbackFoodId = cleanId(item?.food_id || item?.id);
  const titleKey = normalizeLookupKey(item?.title || item?.food_name || '');
  const caloriesKey = Math.round(toNumber(item?.calories, 0));
  const gramsKey = Math.round(toNumber(item?.metric_serving_amount, 0) || toNumber(item?.grams, 0));
  const acceptanceModeKey = normalizeLookupKey(item?.mapping_acceptance_mode || '');

  return [
    `fat:${explicitFatSecretId || '-'}`,
    `food:${fallbackFoodId || '-'}`,
    `title:${titleKey || '-'}`,
    `cal:${caloriesKey}`,
    `grams:${gramsKey}`,
    `allow:${allowTitleFallback ? '1' : '0'}`,
    `mode:${acceptanceModeKey || '-'}`,
  ].join('|');
};
const cloneFoodDetailFactsResult = (value: FoodDetailFactsResult | null) =>
  value ? JSON.parse(JSON.stringify(value)) as FoodDetailFactsResult : null;
const getCachedFoodDetailFactsResult = (cacheKey: string) => {
  const cached = foodDetailFactsCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > FOOD_DETAIL_FACTS_CACHE_TTL_MS) {
    foodDetailFactsCache.delete(cacheKey);
    return null;
  }
  return cloneFoodDetailFactsResult(cached.value);
};
const setCachedFoodDetailFactsResult = (cacheKey: string, value: FoodDetailFactsResult | null) => {
  if (!value) return value;
  foodDetailFactsCache.set(cacheKey, {
    savedAt: Date.now(),
    value: cloneFoodDetailFactsResult(value) as FoodDetailFactsResult,
  });
  return value;
};
const isPreparedDishCandidate = (item: any, queries: string[]) => {
  const foodType = normalizeLookupKey(item?.food_type || item?.type || '');
  const category = normalizeLookupKey(item?.category || '');
  const isDrinkCategory = category.includes('drink') || foodType.includes('drink') || foodType.includes('beverage');
  const isSideCategory = category.includes('side');
  const isMainCategory = category.includes('main');
  if (isDrinkCategory) {
    return false;
  }
  if (foodType.includes('recipe') || category.includes('recipe') || category.includes('meal')) {
    return true;
  }

  const primaryQuery = normalizeLookupKey(queries[0] || '');
  if (!primaryQuery) return false;
  const wordCount = primaryQuery.split(/\s+/).filter(Boolean).length;
  const hasPreparedDishKeyword = PREPARED_DISH_KEYWORDS.some((keyword) => primaryQuery.includes(keyword));
  const hasSingleWordMainKeyword = SINGLE_WORD_MAIN_DISH_KEYWORDS.some((keyword) => primaryQuery.includes(keyword));

  if (isSideCategory) {
    return hasPreparedDishKeyword;
  }
  if (isMainCategory) {
    return wordCount >= 2 || hasPreparedDishKeyword || hasSingleWordMainKeyword;
  }

  return hasPreparedDishKeyword;
};
const isCachedImageLookupEntry = (value: any): value is CachedImageLookupEntry =>
  !!value &&
  typeof value === 'object' &&
  typeof value.image === 'string' &&
  typeof value.source === 'string' &&
  typeof value.state === 'string' &&
  typeof value.cachedAt === 'number' &&
  typeof value.expiresAt === 'number';
const canUseImageLookupCacheStorage = () =>
  typeof window !== 'undefined' ||
  (typeof navigator !== 'undefined' && navigator.product === 'ReactNative');
const pruneImageLookupCacheEntries = () => {
  const now = Date.now();
  const validEntries = Array.from(imageLookupCache.entries())
    .filter(([, entry]) => entry.expiresAt > now)
    .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
    .slice(0, IMAGE_LOOKUP_CACHE_MAX_ENTRIES);

  imageLookupCache.clear();
  for (const [key, entry] of validEntries) {
    imageLookupCache.set(key, entry);
  }
  return validEntries;
};
const persistImageLookupCache = async () => {
  if (!canUseImageLookupCacheStorage()) return;

  try {
    const payload = JSON.stringify(Object.fromEntries(pruneImageLookupCacheEntries()));
    await AsyncStorage.setItem(IMAGE_LOOKUP_CACHE_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('[mealAPI] failed to persist image lookup cache', error);
  }
};
const scheduleImageLookupCachePersist = () => {
  if (imageLookupCachePersistTimer !== null) return;

  imageLookupCachePersistTimer = setTimeout(() => {
    imageLookupCachePersistTimer = null;
    void persistImageLookupCache();
  }, 200);
};
const ensureImageLookupCacheReady = async () => {
  if (hasLoadedImageLookupCache) return;
  if (!canUseImageLookupCacheStorage()) {
    hasLoadedImageLookupCache = true;
    return;
  }

  if (!imageLookupCacheReadyPromise) {
    imageLookupCacheReadyPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(IMAGE_LOOKUP_CACHE_STORAGE_KEY);
        if (!raw) {
          hasLoadedImageLookupCache = true;
          return;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          hasLoadedImageLookupCache = true;
          return;
        }

        const now = Date.now();
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!isCachedImageLookupEntry(value) || value.expiresAt <= now) continue;
          imageLookupCache.set(key, value);
        }
      } catch (error) {
        console.warn('[mealAPI] failed to load image lookup cache', error);
      } finally {
        hasLoadedImageLookupCache = true;
      }
    })().finally(() => {
      imageLookupCacheReadyPromise = null;
    });
  }

  await imageLookupCacheReadyPromise;
};
const getCachedImageLookupResult = async (keys: string[]): Promise<ResolvedImageLookup | null> => {
  await ensureImageLookupCacheReady();

  const now = Date.now();
  let removedExpiredEntry = false;
  for (const key of keys) {
    const cached = imageLookupCache.get(key);
    if (!cached) continue;
    if (cached.expiresAt <= now) {
      imageLookupCache.delete(key);
      removedExpiredEntry = true;
      continue;
    }

    return {
      image: cached.image,
      food_id: cached.food_id,
      recipe_id: cached.recipe_id,
      lookupState: cached.state,
      source: cached.source,
      cacheHit: true,
    };
  }

  if (removedExpiredEntry) {
    scheduleImageLookupCachePersist();
  }
  return null;
};
const cacheImageLookupResult = (keys: string[], result: ResolvedImageLookup) => {
  const now = Date.now();
  const entry: CachedImageLookupEntry = {
    image: String(result.image || '').trim(),
    food_id: result.food_id || null,
    recipe_id: result.recipe_id || null,
    source: result.source,
    state: result.lookupState,
    cachedAt: now,
    expiresAt: now + (result.image ? IMAGE_LOOKUP_CACHE_TTL_MS : IMAGE_LOOKUP_MISS_TTL_MS),
  };

  for (const key of keys) {
    if (!key) continue;
    imageLookupCache.set(key, entry);
  }
  scheduleImageLookupCachePersist();
};
const logImageResolutionResult = (item: any, result: ResolvedImageLookup) => {
  console.log('[mealAPI] resolveFoodImageFromFatSecret result', {
    title: String(item?.title || item?.food_name || ''),
    source: result.source,
    cacheHit: !!result.cacheHit,
    lookupState: result.lookupState,
    hasImage: !!String(result.image || '').trim(),
  });
};
const resolveImageFromFoodHits = async (hits: any[], targetCalories = 0): Promise<ResolvedImageLookup | null> => {
  let bestImage = '';
  let bestId = '';
  let bestDiff = Number.POSITIVE_INFINITY;
  let detailChecks = 0;

  for (const hit of hits.slice(0, 5)) {
    const hitId = cleanId(hit?.id);
    const hitImage = String(hit?.image || '').trim();
    if (!bestImage && hitImage) {
      bestImage = hitImage;
      bestId = hitId;
    }

    if (targetCalories > 0 && hitId && detailChecks < 2) {
      detailChecks += 1;
      const detail = await getFoodById(hitId, { expectedCalories: targetCalories });
      const detailImage = String(detail?.image || hitImage).trim();
      const calories = toNumeric(detail?.calories, 0);
      const diff = calories > 0 ? Math.abs(calories - targetCalories) / targetCalories : 1;
      if (detailImage && diff <= 0.35 && diff < bestDiff) {
        bestDiff = diff;
        bestImage = detailImage;
        bestId = cleanId(detail?.food_id || hitId);
      }
    }
  }

  if (!bestImage) {
    const firstWithId = hits.find((hit: any) => cleanId(hit?.id)) || hits[0];
    const firstId = cleanId(firstWithId?.id);
    if (firstId) {
      const detail = await getFoodById(firstId, {
        expectedCalories: targetCalories > 0 ? targetCalories : undefined,
      });
      bestImage = String(detail?.image || '').trim();
      bestId = cleanId(detail?.food_id || firstId);
    }
  }

  if (!bestImage) return null;
  return {
    image: bestImage,
    food_id: bestId || null,
    lookupState: 'resolved',
    source: 'food-search',
  };
};
const resolveImageFromRecipeHits = async (hits: any[], targetCalories = 0): Promise<ResolvedImageLookup | null> => {
  let bestImage = '';
  let bestRecipeId = '';
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const hit of hits.slice(0, 4)) {
    const hitImage = String(hit?.image || '').trim();
    const calories = toNumeric(hit?.calories, 0);
    const diff = targetCalories > 0 && calories > 0 ? Math.abs(calories - targetCalories) / targetCalories : 0.45;
    if (hitImage && diff < bestDiff) {
      bestImage = hitImage;
      bestRecipeId = cleanId(hit?.id);
      bestDiff = diff;
    }
  }

  if (!bestImage) {
    for (const hit of hits.slice(0, 2)) {
      const recipeId = cleanId(hit?.id);
      if (!recipeId) continue;
      const detail = await getRecipeDetails(recipeId);
      const detailImage = String(detail?.image || '').trim();
      const calories = toNumeric(detail?.calories, 0);
      const diff = targetCalories > 0 && calories > 0 ? Math.abs(calories - targetCalories) / targetCalories : 0.5;
      if (detailImage && diff < bestDiff) {
        bestImage = detailImage;
        bestRecipeId = recipeId;
        bestDiff = diff;
      }
    }
  }

  if (!bestImage) return null;
  return {
    image: bestImage,
    food_id: null,
    recipe_id: bestRecipeId || null,
    lookupState: 'resolved',
    source: 'recipe-search',
  };
};
if (canUseImageLookupCacheStorage()) {
  void ensureImageLookupCacheReady();
}

const buildBackendApiUrl = (
  path: string,
  params?: Record<string, string | number | undefined | null>
) => {
  const baseUrl = String(BACKEND_API_URL || '').trim();
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_BACKEND_URL for FatSecret proxy requests.');
  }

  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

const requestFatSecretProxy = async (
  path: string,
  options: {
    requestLabel: string;
    params?: Record<string, string | number | undefined | null>;
  }
) => {
  const { requestLabel, params } = options;

  try {
    const response = await fetch(buildBackendApiUrl(path, params), {
      method: 'GET',
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.warn(`[mealAPI] ${requestLabel} proxy returned a non-JSON response`, jsonError);
      return null;
    }

    if (!response.ok) {
      console.warn(`[mealAPI] ${requestLabel} proxy failed`, {
        status: response.status,
        error: data?.error || null,
        details: data?.details || null,
      });
      return null;
    }

    return data;
  } catch (error) {
    console.error(`[mealAPI] ${requestLabel} proxy request error`, error);
    return null;
  }
};


// This function will help us get the recipe data using recipes.search method
export const searchRecipes = async (query: string, maxResults = 15) => {
  try {
    const recipeQuery = normalizeWhitespace(query) || DEFAULT_RECIPE_SEARCH_QUERY;
    const data = await requestFatSecretProxy('/api/fatsecret/recipes/search', {
      requestLabel: 'recipes.search',
      params: {
        query: recipeQuery,
        maxResults,
      },
    });
    if (!data) return [];
 
    const rawRecipes = data?.items || [];
    const recipeList = Array.isArray(rawRecipes) ? rawRecipes : [rawRecipes];


    return recipeList.map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      image: item.image,
     
      calories: parseInt(item?.calories, 10) || 0,
      protein: parseFloat(item?.protein) || 0,
      carbs: parseFloat(item?.carbs) || 0,
      fats: parseFloat(item?.fats) || 0,


      time: item?.time || '15 min',
    }));


  } catch (error) {
    console.error("Recipe Search Error:", error);
    return [];
  }
};


// This function will help us extract food data using foods.search method
export const searchFoodItems = async (query: string, maxResults = 10) => {
  try {
    const data = await requestFatSecretProxy('/api/fatsecret/foods/search', {
      requestLabel: 'foods.search',
      params: {
        query,
        maxResults,
      },
    });
    if (!data) return [];
    const foodItems = data?.items || [];
    const itemsArray = Array.isArray(foodItems) ? foodItems : (foodItems ? [foodItems] : []);


    return itemsArray.map((item: any) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      brand: item.brand_name || "Generic",
      food_type: item.food_type || "Generic",
      food_url: item.food_url || null,
      image: item.image || null,
    }));


  } catch (error) {
    console.error("Food Search Error:", error);
    return [];
  }
};


// SEARCH FOOD ITEMS WITH NUTRITION DATA (Enriched version)
// This fetches food items and then enriches each with nutritional data
export const searchFoodItemsWithNutrition = async (query: string, maxResults = 10) => {
  try {
    // First, get basic food items
    const basicItems = await searchFoodItems(query, maxResults);
    
    if (basicItems.length === 0) return [];
    
    // Then enrich each item with nutritional data
    const enrichedItems = await Promise.all(
      basicItems.map(async (item: any) => {
        try {
          const foodId = item.id || item.food_id;
          if (!foodId) return item;
          
          // Fetch detailed nutritional information
          const detailedFood = await getFoodById(String(foodId));
          
          if (detailedFood) {
            // Merge basic info with detailed nutrition data
            return {
              ...item,
              ...detailedFood,
              // Ensure these fields exist for ComboCard
              grams: detailedFood.metric_serving_amount || 100,
              time: detailedFood.time || '15 min',
            };
          }
          return item;
        } catch (error) {
          console.error(`Error fetching details for food ${item.id}:`, error);
          return item;
        }
      })
    );
    
    return enrichedItems;
  } catch (error) {
    console.error("Food Search with Nutrition Error:", error);
    return [];
  }
};


// GET FOOD BY ID (To extract exact data before adding)
export const getFoodById = async (
  foodId: string,
  options: {
    expectedCalories?: number;
  } = {}
) => {
  if (String(foodId || "").startsWith("local-")) return null;
  try {
    const data = await requestFatSecretProxy(`/api/fatsecret/foods/${encodeURIComponent(foodId)}`, {
      requestLabel: 'food.get.v5',
      params: {
        expectedCalories: options.expectedCalories,
      },
    });
    if (!data) return null;
    return data?.item || null;


  } catch (error) {
    console.error("Get Food ID Error:", error);
    return null;
  }
};

type FoodDetail = NonNullable<Awaited<ReturnType<typeof getFoodById>>>;


// Fetch Full Recipe Details (Ingredients & Directions)
export const getRecipeDetails = async (recipeId: string) => {
  try {
    const data = await requestFatSecretProxy(`/api/fatsecret/recipes/${encodeURIComponent(recipeId)}`, {
      requestLabel: 'recipe.get',
    });
    if (!data) return null;
    return data?.item || null;


  } catch (error) {
    console.error("Get Recipe Details Error:", error);
    return null;
  }
};

export const resolveFoodImageFromFatSecret = async (
  item: any,
  options: { preferFatSecretImage?: boolean } = {}
) => {
  const explicitFatSecretId = cleanId(item?.fatsecret_food_id);
  const fallbackId = cleanId(item?.food_id || item?.id);
  const rawId = explicitFatSecretId || fallbackId;
  const image = String(item?.image || "").trim();
  const preferFatSecretImage = !!options.preferFatSecretImage;
  const hasResolvableFatSecretId = !!rawId && !rawId.startsWith("local-");
  // Skip direct food_id lookup for relaxed-title-fallback mappings: their food_id may map to a
  // different food in FatSecret whose image is unrelated to the actual item. Fall through to
  // title-based search which is more semantically reliable.
  const isRelaxedTitleFallback =
    String(item?.mapping_acceptance_mode || "").toLowerCase() === "relaxed_title_fallback";
  const skipDirectIdLookup = isRelaxedTitleFallback && !preferFatSecretImage;
  const targetCalories = toNumber(item?.calories, 0);
  const queries = buildImageSearchQueries(item);
  const cacheKeys = buildImageLookupKeys(rawId, queries);

  const returnResult = (result: ResolvedImageLookup) => {
    logImageResolutionResult(item, result);
    return result;
  };

  if (image && !preferFatSecretImage) {
    return returnResult({
      image,
      food_id: rawId || null,
      lookupState: 'resolved',
      source: 'existing',
    });
  }

  const cached = await getCachedImageLookupResult(cacheKeys);
  if (cached) {
    return returnResult({
      image: cached.image,
      food_id: preferFatSecretImage || cached.lookupState === 'unavailable' ? null : cached.food_id,
      recipe_id: cached.recipe_id || null,
      lookupState: cached.lookupState,
      source: cached.source,
      cacheHit: true,
    });
  }

  if (hasResolvableFatSecretId && !skipDirectIdLookup) {
    const detail = await getFoodById(rawId, {
      expectedCalories: targetCalories > 0 ? targetCalories : undefined,
    });
    const detailImage = String(detail?.image || '').trim();
    if (detailImage) {
      const resolved: ResolvedImageLookup = {
        image: detailImage,
        food_id: cleanId(detail?.food_id || rawId) || null,
        lookupState: 'resolved',
        source: 'food-detail',
      };
      cacheImageLookupResult(
        [...cacheKeys, ...(resolved.food_id ? [`id:${resolved.food_id}`] : [])],
        resolved
      );
      return returnResult({
        ...resolved,
        food_id: preferFatSecretImage ? null : resolved.food_id,
      });
    }
  }

  for (const query of queries.slice(0, FOOD_IMAGE_QUERY_LIMIT)) {
    const hits = await searchFoodItems(query, 5);
    if (!hits.length) continue;

    const resolved = await resolveImageFromFoodHits(hits, targetCalories);
    if (!resolved?.image) continue;

    cacheImageLookupResult(
      [...cacheKeys, ...(resolved.food_id ? [`id:${resolved.food_id}`] : [])],
      resolved
    );
    return returnResult({
      ...resolved,
      food_id: preferFatSecretImage ? null : resolved.food_id,
    });
  }

  if (isPreparedDishCandidate(item, queries)) {
    for (const query of queries.slice(0, RECIPE_IMAGE_QUERY_LIMIT)) {
      const hits = await searchRecipes(query, 4);
      if (!hits.length) continue;

      const resolved = await resolveImageFromRecipeHits(hits, targetCalories);
      if (!resolved?.image) continue;

      cacheImageLookupResult(cacheKeys, resolved);
      return returnResult({
        ...resolved,
        food_id: null,
      });
    }
  }

  const missResult: ResolvedImageLookup = {
    image: '',
    food_id: null,
    lookupState: 'unavailable',
    source: 'miss',
  };
  cacheImageLookupResult(cacheKeys, missResult);
  return returnResult(missResult);
};


// Daily Value Reference (FDA)
const DAILY_VALUES = {
  totalFat: 78,
  saturatedFat: 20,
  cholesterol: 300,
  sodium: 2300,
  totalCarbs: 275,
  fiber: 28,
  addedSugars: 50,
  protein: 50,
  vitaminD: 20, // mcg
  calcium: 1300, // mg
  iron: 18, // mg
  potassium: 4700, // mg
  vitaminA: 900, // mcg
  vitaminC: 90, // mg
};

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasMeaningfulMacroSnapshot = (item: any) =>
  ["calories", "protein", "carbs", "fats", "fat"].some((key) => toNumber(item?.[key], 0) > 0);

const calculateDV = (value: number, dv: number) => (dv > 0 ? Math.round((value / dv) * 100) : 0);

export const buildNutritionFactsFromFood = (food: any) => {
  if (!food) return null;

  const calories = toNumber(food.calories, 0);
  const fat = toNumber(food.fats ?? food.fat, 0);
  const saturatedFat = toNumber(food.saturated_fat, 0);
  const transFat = toNumber(food.trans_fat, 0);
  const polyunsaturatedFat = toNumber(food.polyunsaturated_fat, 0);
  const monounsaturatedFat = toNumber(food.monounsaturated_fat, 0);
  const cholesterol = toNumber(food.cholesterol, 0);
  const sodium = toNumber(food.sodium, 0);
  const carbs = toNumber(food.carbs ?? food.carbohydrate, 0);
  const fiber = toNumber(food.fiber, 0);
  const sugar = toNumber(food.sugar, 0);
  const addedSugars = toNumber(food.added_sugars, 0);
  const protein = toNumber(food.protein, 0);
  const vitaminD = toNumber(food.vitamin_d, 0);
  const calcium = toNumber(food.calcium, 0);
  const iron = toNumber(food.iron, 0);
  const potassium = toNumber(food.potassium, 0);
  const vitaminA = toNumber(food.vitamin_a, 0);
  const vitaminC = toNumber(food.vitamin_c, 0);

  return {
    servingDescription: food?.serving_description || "1 serving",
    servingSize: toNumber(food?.metric_serving_amount, 0) || toNumber(food?.number_of_units, 1) || 1,
    servingUnit: food?.metric_serving_unit || food?.measurement_description || "serving",
    calories,
    fat: { value: fat, dv: calculateDV(fat, DAILY_VALUES.totalFat) },
    saturatedFat: { value: saturatedFat, dv: calculateDV(saturatedFat, DAILY_VALUES.saturatedFat) },
    transFat: { value: transFat, dv: 0 },
    polyunsaturatedFat,
    monounsaturatedFat,
    cholesterol: { value: cholesterol, dv: calculateDV(cholesterol, DAILY_VALUES.cholesterol) },
    sodium: { value: sodium, dv: calculateDV(sodium, DAILY_VALUES.sodium) },
    carbs: { value: carbs, dv: calculateDV(carbs, DAILY_VALUES.totalCarbs) },
    fiber: { value: fiber, dv: calculateDV(fiber, DAILY_VALUES.fiber) },
    sugar,
    addedSugars: { value: addedSugars, dv: calculateDV(addedSugars, DAILY_VALUES.addedSugars) },
    protein: { value: protein, dv: calculateDV(protein, DAILY_VALUES.protein) },
    vitaminD: { value: vitaminD, unit: "mcg", dv: calculateDV(vitaminD, DAILY_VALUES.vitaminD) },
    calcium: { value: calcium, unit: "mg", dv: calculateDV(calcium, DAILY_VALUES.calcium) },
    iron: { value: iron, unit: "mg", dv: calculateDV(iron, DAILY_VALUES.iron) },
    potassium: { value: potassium, unit: "mg", dv: calculateDV(potassium, DAILY_VALUES.potassium) },
    vitaminA: { value: vitaminA, unit: "mcg", dv: calculateDV(vitaminA, DAILY_VALUES.vitaminA) },
    vitaminC: { value: vitaminC, unit: "mg", dv: calculateDV(vitaminC, DAILY_VALUES.vitaminC) },
  };
};

export const getDetailedNutritionFacts = async (foodId: string) => {
  const food = await getFoodById(foodId);
  return buildNutritionFactsFromFood(food);
};

// Unified fetch for food detail page (image + serving + macros + full nutrition facts)
export const fetchFoodDetailForFacts = async (
  item: any,
  options: { allowTitleFallback?: boolean } = {}
) => {
  if (!item) return null;

  const explicitFatSecretId = cleanId(item?.fatsecret_food_id);
  const fallbackFoodId = cleanId(item?.food_id || item?.id);
  const primaryId = explicitFatSecretId || fallbackFoodId;
  const hasResolvableId = !!primaryId && !primaryId.startsWith("local-");
  const hasExplicitFatSecretId = !!explicitFatSecretId && !explicitFatSecretId.startsWith("local-");
  const isRelaxedTitleFallback =
    String(item?.mapping_acceptance_mode || "").toLowerCase() === "relaxed_title_fallback";
  const shouldSkipFallbackIdLookup = isRelaxedTitleFallback && !hasExplicitFatSecretId;
  const preserveRecommendedCore = !hasExplicitFatSecretId;
  const preserveOriginalMacros = preserveRecommendedCore && hasMeaningfulMacroSnapshot(item);
  const targetCalories = toNumber(item?.calories, 0);
  let foodId = hasResolvableId && !shouldSkipFallbackIdLookup ? primaryId : "";
  const title = String(item?.title || item?.food_name || "").trim();
  const allowTitleFallback = options.allowTitleFallback ?? !foodId;
  const cacheKey = buildFoodDetailFactsCacheKey(item, allowTitleFallback);
  const cachedResult = getCachedFoodDetailFactsResult(cacheKey);
  if (cachedResult) {
    console.log("[mealAPI] fetchFoodDetailForFacts cache hit", {
      cacheKey,
      requestedFoodId: primaryId,
      title,
    });
    return cachedResult;
  }

  const existingRequest = inFlightFoodDetailFactsRequests.get(cacheKey);
  if (existingRequest) {
    console.log("[mealAPI] fetchFoodDetailForFacts joining in-flight request", {
      cacheKey,
      requestedFoodId: primaryId,
      title,
    });
    return existingRequest.then((result) => cloneFoodDetailFactsResult(result));
  }

  const requestPromise = (async () => {
  console.log("[mealAPI] fetchFoodDetailForFacts", {
    hasFoodId: hasResolvableId,
    explicitFatSecretId,
    foodId,
    allowTitleFallback,
    isRelaxedTitleFallback,
    shouldSkipFallbackIdLookup,
    preserveRecommendedCore,
    preserveOriginalMacros,
    title,
    targetCalories,
  });

  const fallbackServingAmount = toNumber(item?.metric_serving_amount, 0) || toNumber(item?.grams, 0);
  const fallbackServingText =
    fallbackServingAmount > 0 ? `${Math.round(fallbackServingAmount)} ${item?.metric_serving_unit || "g"}` : "";
  const preserveOriginalServing =
    preserveRecommendedCore &&
    !!(
      String(item?.serving_description || "").trim() ||
      fallbackServingAmount > 0 ||
      item?.measurement_description ||
      item?.number_of_units
    );

  const mergeResolvedFood = (source: any | null) => {
    const merged = source ? { ...item, ...source } : { ...item };
    console.log("[mealAPI] mergeResolvedFood", {
      preserveOriginalMacros,
      preserveOriginalServing,
      sourceFoodId: source?.food_id || source?.id || null,
      sourceCalories: toNumber(source?.calories, 0),
      originalCalories: toNumber(item?.calories, 0),
    });

    merged.title = item?.title || source?.title || merged.title;

    if (preserveOriginalMacros) {
      merged.calories = toNumber(item?.calories, toNumber(source?.calories, 0));
      merged.protein = toNumber(item?.protein, toNumber(source?.protein, 0));
      merged.carbs = toNumber(item?.carbs, toNumber(source?.carbs, 0));
      merged.fats = toNumber(item?.fats, toNumber(source?.fats, 0));
    } else {
      merged.calories = toNumber(source?.calories, toNumber(item?.calories, 0));
      merged.protein = toNumber(source?.protein, toNumber(item?.protein, 0));
      merged.carbs = toNumber(source?.carbs, toNumber(item?.carbs, 0));
      merged.fats = toNumber(source?.fats, toNumber(item?.fats, 0));
    }

    if (preserveOriginalServing) {
      merged.serving_description = item?.serving_description || fallbackServingText || source?.serving_description || "1 serving";
      const metricAmount = toNumber(item?.metric_serving_amount, 0) || toNumber(item?.grams, 0);
      if (metricAmount > 0) merged.metric_serving_amount = metricAmount;
      if (item?.metric_serving_unit) merged.metric_serving_unit = item.metric_serving_unit;
      if (item?.measurement_description) merged.measurement_description = item.measurement_description;
      if (item?.number_of_units) merged.number_of_units = item.number_of_units;
    } else {
      merged.serving_description = source?.serving_description || item?.serving_description || fallbackServingText || "1 serving";
    }

    merged.id = source?.id || source?.food_id || item?.id || foodId || null;
    merged.food_id = source?.food_id || foodId || item?.food_id || item?.id || null;
    merged.fatsecret_food_id = hasExplicitFatSecretId ? explicitFatSecretId : item?.fatsecret_food_id || null;
    merged.image = item?.image || source?.image || "";

    return merged;
  };

  const buildFoodDetailFactsResult = (source: any | null): FoodDetailFactsResult => {
    const merged = mergeResolvedFood(source);
    return {
      item: merged,
      nutritionFacts: buildNutritionFactsFromFood(merged),
    };
  };

  const resolveByTitle = async (): Promise<FoodDetail | null> => {
    if (!allowTitleFallback) return null;
    if (!title) return null;
    let bestFood: FoodDetail | null = null;
    let bestScore = -1;
    let bestSimilarity = 0;
    const titleQueries = buildImageSearchQueries(item).slice(0, FOOD_IMAGE_QUERY_LIMIT);

    for (const query of titleQueries) {
      const hits = await searchFoodItems(query, 6);
      const candidateIds = ensureArray(hits).map((hit: any) => cleanId(hit?.id)).filter(Boolean).slice(0, 6);
      if (candidateIds.length === 0) continue;

      for (const candidateId of candidateIds) {
        const candidate = await getFoodById(candidateId, {
          expectedCalories: targetCalories > 0 ? targetCalories : undefined,
        });
        if (!candidate) continue;
        const cals = toNumber(candidate?.calories, 0);
        const diff = targetCalories > 0 ? Math.abs(cals - targetCalories) / targetCalories : 0;
        if (targetCalories > 0 && diff > 0.2) {
          console.log("[mealAPI] resolveByTitle reject calorie mismatch", {
            title,
            query,
            candidateId,
            candidateCalories: cals,
            targetCalories,
            diff,
          });
          continue;
        }

        const titleSimilarity = computeTitleSimilarity(title, candidate?.title || candidate?.food_name || '');
        if (titleSimilarity < TITLE_FALLBACK_MIN_SIMILARITY) {
          console.log("[mealAPI] resolveByTitle reject low title similarity", {
            title,
            query,
            candidateId,
            candidateTitle: candidate?.title || candidate?.food_name || '',
            titleSimilarity,
          });
          continue;
        }

        const richerFields = [
          "sodium",
          "cholesterol",
          "fiber",
          "sugar",
          "calcium",
          "iron",
          "potassium",
          "vitamin_c",
        ];
        const richness = richerFields.reduce((sum, key) => sum + (toNumber((candidate as any)?.[key], 0) > 0 ? 1 : 0), 0);
        const calorieScore = targetCalories > 0 ? 1 - Math.min(1, diff / 0.2) : 0.5;
        const finalScore = calorieScore * 0.55 + (richness / richerFields.length) * 0.15 + titleSimilarity * 0.3;
        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestFood = candidate;
          bestSimilarity = titleSimilarity;
        }
      }
    }
    console.log("[mealAPI] resolveByTitle best candidate", {
      title,
      queries: titleQueries,
      food_id: bestFood?.food_id || null,
      calories: toNumber(bestFood?.calories, 0),
      score: bestScore,
      title_similarity: bestSimilarity,
    });
    return bestFood;
  };

  if (!foodId) {
    const fallbackFood = await resolveByTitle();
    return setCachedFoodDetailFactsResult(cacheKey, buildFoodDetailFactsResult(fallbackFood));
  }

  let food = await getFoodById(foodId, {
    expectedCalories: targetCalories > 0 ? targetCalories : undefined,
  });
  if (!food) {
    console.log("[mealAPI] getFoodById miss", { foodId, title, allowTitleFallback });
    if (allowTitleFallback) {
      food = await resolveByTitle();
      foodId = String(food?.food_id || foodId).trim();
    }
  }
  if (!food) {
    return setCachedFoodDetailFactsResult(cacheKey, buildFoodDetailFactsResult(null));
  }

    return setCachedFoodDetailFactsResult(cacheKey, buildFoodDetailFactsResult(food));
  })().finally(() => {
    const currentRequest = inFlightFoodDetailFactsRequests.get(cacheKey);
    if (currentRequest === requestPromise) {
      inFlightFoodDetailFactsRequests.delete(cacheKey);
    }
  });

  inFlightFoodDetailFactsRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

export type { MealCombo } from "./mealAPI.combos";

export const generateMealCombos = async () =>
  generateMealCombosWithResolvers({ searchFoodItems, getFoodById, totalCombos: 5 });
