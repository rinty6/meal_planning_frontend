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
  /**
   * Set when a meal was added, edited or deleted anywhere in the app. Until this
   * store had a dirty flag, the only staleness control was the 15s TTL below, so
   * a meal logged from another screen left Home showing old calorie numbers.
   */
  dirty: boolean;
};

const homeByUser = new Map<string, HomeSnapshot>();

/**
 * Listeners notified whenever meal data changes.
 *
 * The TTL and dirty flag are enough for screens that re-run their focus effect,
 * but the voice-search modal is mounted inside the tabs layout and renders over
 * the active tab. A React Native Modal is not a navigation event, so Home never
 * blurs and never re-focuses while it is used — nothing would ever prompt a
 * refresh. Subscribers get told directly instead.
 */
type HomeDataListener = () => void;
const listeners = new Set<HomeDataListener>();

export const subscribeToHomeData = (listener: HomeDataListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyHomeDataChanged = () => {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('home data listener failed:', error);
    }
  });
};

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
    dirty: snapshot.dirty,
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
    // A successful write is the only thing that clears the flag, so a refresh
    // that gets skipped or fails stays queued for the next opportunity.
    dirty: false,
  });
};

export const setCachedHomeUserName = (userId: string, dbUserName: string) => {
  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName,
    macros: cloneMacros(current?.macros || null),
    targetResolved: current?.targetResolved ?? false,
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
    dirty: current?.dirty ?? false,
  });
};

/**
 * Marks the cached dashboard stale and tells subscribers. Called for every meal
 * mutation via markMealsSummaryDirty, so new mutation sites cannot forget it.
 */
export const markHomeDashboardDirty = (userId?: string | null) => {
  if (userId) {
    const current = homeByUser.get(userId);
    if (current) {
      homeByUser.set(userId, { ...current, dirty: true });
    }
  }
  notifyHomeDataChanged();
};

export const shouldRefreshHomeDashboard = (userId?: string | null, maxAgeMs = 15_000) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.macros) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.dashboardFetchedAt > maxAgeMs;
};
