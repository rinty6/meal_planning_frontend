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
  /**
   * False when `macros.target` fell back to DEFAULT_CALORIE_TARGET (2000) because the
   * calorie-summary fetch failed — i.e. the target is a placeholder, not the user's real
   * goal. Other screens must not present an unresolved target as authoritative (that is
   * the misleading-2000 behaviour the calorie rewrite removed from Meal Planning).
   */
  targetResolved: boolean;
  dashboardFetchedAt: number;
};

const homeByUser = new Map<string, HomeSnapshot>();

const cloneMacros = (macros: HomeMacroState | null) =>
  macros
    ? {
        consumed: { ...macros.consumed },
        target: { ...macros.target },
      }
    : null;

export const getCachedHomeSnapshot = (userId?: string | null): HomeSnapshot | null => {
  if (!userId) return null;
  const snapshot = homeByUser.get(userId);
  if (!snapshot) return null;
  return {
    dbUserName: snapshot.dbUserName,
    macros: cloneMacros(snapshot.macros),
    targetResolved: snapshot.targetResolved,
    dashboardFetchedAt: snapshot.dashboardFetchedAt,
  };
};

export const setCachedHomeDashboard = (
  userId: string,
  payload: { dbUserName: string; macros: HomeMacroState; targetResolved?: boolean }
) => {
  homeByUser.set(userId, {
    dbUserName: payload.dbUserName,
    macros: cloneMacros(payload.macros),
    targetResolved: payload.targetResolved !== false,
    dashboardFetchedAt: Date.now(),
  });
};

export const setCachedHomeUserName = (userId: string, dbUserName: string) => {
  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName,
    macros: cloneMacros(current?.macros || null),
    targetResolved: current?.targetResolved ?? false,
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
  });
};

export const shouldRefreshHomeDashboard = (userId?: string | null, maxAgeMs = 15_000) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.macros) return true;
  return Date.now() - snapshot.dashboardFetchedAt > maxAgeMs;
};
