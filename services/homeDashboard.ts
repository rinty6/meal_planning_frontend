// Shared home-dashboard fetch + macro helpers.
//
// Extracted from app/(tabs)/index.tsx so the same logic can be used in two places:
//   1. the Home screen itself (on focus), and
//   2. the startup screen (app/index.tsx), which PRE-WARMS this cache during the
//      loading animation so the Home screen hydrates instantly with no second
//      white spinner (see IMPLEMENTATION_CHECKLIST §4A).
//
// Keeping one copy of the macro math avoids drift between the two callers (checklist E25).

import { authedFetch, type GetToken } from './authedFetch';
import { fetchMealsSummaryWithCache } from './mealsSummaryStore';
import { setCachedHomeDashboard } from './homeStore';

export type MacroSet = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

export type HomeMacroState = {
  consumed: MacroSet;
  target: MacroSet;
};

export const DEFAULT_CALORIE_TARGET = 2000;

export const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

export const hasMacros = (macroData: MacroSet) =>
  macroData.calories > 0 || macroData.protein > 0 || macroData.carbs > 0 || macroData.fats > 0;

export const extractConsumedMacros = (summaryData: any): MacroSet => {
  const consumed = summaryData?.consumed ?? summaryData?.summary ?? summaryData?.totals ?? {};
  return {
    calories: firstNumber(consumed.calories, consumed.kcal, consumed.totalCalories, summaryData?.calories, summaryData?.totalCalories),
    protein: firstNumber(consumed.protein, consumed.proteins, consumed.totalProtein, summaryData?.protein, summaryData?.totalProtein),
    carbs: firstNumber(consumed.carbs, consumed.carbohydrates, consumed.totalCarbs, summaryData?.carbs, summaryData?.totalCarbs),
    fats: firstNumber(consumed.fats, consumed.fat, consumed.totalFat, summaryData?.fats, summaryData?.fat, summaryData?.totalFats),
  };
};

export const aggregateMeals = (meals: any[]): MacroSet =>
  meals.reduce(
    (totals: MacroSet, meal: any) => ({
      calories: totals.calories + toNumber(meal?.calories),
      protein: totals.protein + toNumber(meal?.protein),
      carbs: totals.carbs + toNumber(meal?.carbs),
      fats: totals.fats + firstNumber(meal?.fats, meal?.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

export const buildTargetMacros = (dailyCalories: number): MacroSet => ({
  calories: dailyCalories,
  carbs: (dailyCalories * 0.5) / 4,
  protein: (dailyCalories * 0.3) / 4,
  fats: (dailyCalories * 0.2) / 9,
});

// Format date strictly as YYYY-MM-DD for local time.
export const getTodayFormatted = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

type FetchDashboardArgs = {
  apiURL: string;
  userId: string;
  getToken: GetToken;
  /** Clerk first name, used as a display-name fallback when the profile has none. */
  fallbackName?: string | null;
};

type FetchDashboardResult =
  | { ok: true; dbUserName: string; macros: HomeMacroState; targetResolved: boolean }
  | { ok: false };

/**
 * Fetch the home dashboard (profile + today's calorie summary), compute macros, and
 * populate the shared home cache. Never throws — individual endpoint failures degrade
 * gracefully and a hard failure returns `{ ok: false }` so callers can decide what to do.
 */
export const fetchAndCacheHomeDashboard = async ({
  apiURL,
  userId,
  getToken,
  fallbackName,
}: FetchDashboardArgs): Promise<FetchDashboardResult> => {
  if (!apiURL || !userId) return { ok: false };

  try {
    const today = getTodayFormatted();

    const [profileResult, summaryResult] = await Promise.allSettled([
      authedFetch(`/api/profile/${userId}`, { getToken, clerkId: userId }),
      authedFetch(`/api/calorie/summary/${userId}/${today}`, { getToken, clerkId: userId }),
    ]);

    let resolvedUserName = fallbackName || 'User';
    if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
      const profileData = await profileResult.value.json();
      resolvedUserName = profileData.user?.username || fallbackName || 'User';
    }

    let summaryPayload: any = null;
    if (summaryResult.status === 'fulfilled' && summaryResult.value.ok) {
      summaryPayload = await summaryResult.value.json();
    }

    let consumedMacros = extractConsumedMacros(summaryPayload);
    // Track whether this is the user's REAL target or the 2000 placeholder. When the
    // summary fetch fails (offline, 429), firstNumber() returns 0 and we fall back to
    // 2000 — which must never be cached as if it were authoritative, or other screens
    // reading this cache would reintroduce the misleading-2000 display.
    const resolvedTarget = firstNumber(
      summaryPayload?.goal?.dailyCalories,
      summaryPayload?.target?.dailyCalories,
      summaryPayload?.dailyCalories,
      summaryPayload?.targetCalories
    );
    const targetResolved = resolvedTarget > 0;
    const dailyCalorieTarget = resolvedTarget || DEFAULT_CALORIE_TARGET;

    // Fallback: if the summary payload is empty/zero, compute from today's meal logs directly.
    if (!hasMacros(consumedMacros)) {
      const meals = await fetchMealsSummaryWithCache({
        apiURL,
        userId,
        date: today,
        getToken,
      });
      if (meals) {
        consumedMacros = aggregateMeals(meals);
      }
    }

    const macros: HomeMacroState = {
      consumed: consumedMacros,
      target: buildTargetMacros(dailyCalorieTarget),
    };

    setCachedHomeDashboard(userId, { dbUserName: resolvedUserName, macros, targetResolved });
    return { ok: true, dbUserName: resolvedUserName, macros, targetResolved };
  } catch (error) {
    console.warn('fetchAndCacheHomeDashboard failed:', error);
    return { ok: false };
  }
};
