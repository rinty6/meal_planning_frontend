// In-memory cache for `/api/meals/summary/<userId>/<date>` so the Home,
// Meal Summary, and Meal Planning tabs do not each refetch on every focus.
//
// Invariants:
// - Cache lives in JS memory; survives screen unmount but not full reload.
// - Mutations (add/delete meal) must call `markMealsSummaryDirty` so the next
//   focus refetches the source of truth instead of trusting stale data.

type MealsSnapshot = {
  meals: any[];
  fetchedAt: number;
  dirty: boolean;
};

const mealsByKey = new Map<string, MealsSnapshot>();
const inFlightFetches = new Map<string, Promise<any[] | null>>();

const buildKey = (userId: string, date: string) => `${userId}|${date}`;

const cloneMeals = (meals: any[]) => (Array.isArray(meals) ? [...meals] : []);

export const getCachedMealsSummary = (
  userId?: string | null,
  date?: string | null
): MealsSnapshot | null => {
  if (!userId || !date) return null;
  const snapshot = mealsByKey.get(buildKey(userId, date));
  if (!snapshot) return null;
  return {
    meals: cloneMeals(snapshot.meals),
    fetchedAt: snapshot.fetchedAt,
    dirty: snapshot.dirty,
  };
};

export const setCachedMealsSummary = (
  userId: string,
  date: string,
  meals: any[]
) => {
  if (!userId || !date) return;
  mealsByKey.set(buildKey(userId, date), {
    meals: cloneMeals(meals),
    fetchedAt: Date.now(),
    dirty: false,
  });
};

export const markMealsSummaryDirty = (
  userId?: string | null,
  date?: string | null
) => {
  if (!userId) return;

  if (date) {
    const key = buildKey(userId, date);
    const snapshot = mealsByKey.get(key);
    if (snapshot) {
      mealsByKey.set(key, { ...snapshot, dirty: true });
    } else {
      mealsByKey.set(key, { meals: [], fetchedAt: 0, dirty: true });
    }
    return;
  }

  // No date passed -> invalidate every cached date for this user.
  for (const key of Array.from(mealsByKey.keys())) {
    if (!key.startsWith(`${userId}|`)) continue;
    const snapshot = mealsByKey.get(key);
    if (snapshot) {
      mealsByKey.set(key, { ...snapshot, dirty: true });
    }
  }
};

export const shouldRefreshMealsSummary = (
  userId?: string | null,
  date?: string | null,
  maxAgeMs = 15_000
) => {
  if (!userId || !date) return false;
  const snapshot = mealsByKey.get(buildKey(userId, date));
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};

type FetchMealsSummaryArgs = {
  apiURL: string;
  userId: string;
  date: string;
  ttlMs?: number;
  force?: boolean;
};

export const fetchMealsSummaryWithCache = async ({
  apiURL,
  userId,
  date,
  ttlMs = 15_000,
  force = false,
}: FetchMealsSummaryArgs): Promise<any[] | null> => {
  if (!apiURL || !userId || !date) return null;

  const key = buildKey(userId, date);

  if (!force) {
    const cached = mealsByKey.get(key);
    if (cached && !cached.dirty && Date.now() - cached.fetchedAt <= ttlMs) {
      return cloneMeals(cached.meals);
    }
  }

  const inFlight = inFlightFetches.get(key);
  if (inFlight) return inFlight;

  const pending = (async () => {
    try {
      const response = await fetch(
        `${apiURL}/api/meals/summary/${userId}/${date}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      const meals = Array.isArray(data) ? data : [];
      mealsByKey.set(key, {
        meals: cloneMeals(meals),
        fetchedAt: Date.now(),
        dirty: false,
      });
      return cloneMeals(meals);
    } catch {
      return null;
    }
  })();

  inFlightFetches.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlightFetches.get(key) === pending) {
      inFlightFetches.delete(key);
    }
  }
};
