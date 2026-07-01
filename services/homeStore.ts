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
    dashboardFetchedAt: snapshot.dashboardFetchedAt,
  };
};

export const setCachedHomeDashboard = (
  userId: string,
  payload: { dbUserName: string; macros: HomeMacroState }
) => {
  homeByUser.set(userId, {
    dbUserName: payload.dbUserName,
    macros: cloneMacros(payload.macros),
    dashboardFetchedAt: Date.now(),
  });
};

export const setCachedHomeUserName = (userId: string, dbUserName: string) => {
  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName,
    macros: cloneMacros(current?.macros || null),
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
  });
};

export const shouldRefreshHomeDashboard = (userId?: string | null, maxAgeMs = 15_000) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.macros) return true;
  return Date.now() - snapshot.dashboardFetchedAt > maxAgeMs;
};
