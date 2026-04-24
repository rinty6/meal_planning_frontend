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
  dashboardFetchedAt: number;
  foodItemsFetchedAt: number;
};

const homeByUser = new Map<string, HomeSnapshot>();
const isInvalidCachedFoodItem = (item: any) => {
  const id = String(item?.id || item?.food_id || '').trim();
  const source = String(item?.source || '').trim().toLowerCase();
  return id.startsWith('local-') || source === 'local_catalog';
};
const hasInvalidCachedFoodItems = (items: any[] = []) => items.some((item) => isInvalidCachedFoodItem(item));

const cloneMacros = (macros: HomeMacroState | null) =>
  macros
    ? {
        consumed: { ...macros.consumed },
        target: { ...macros.target },
      }
    : null;

const cloneItems = (items: any[]) => items.map((item) => ({ ...item }));

export const getCachedHomeSnapshot = (userId?: string | null): HomeSnapshot | null => {
  if (!userId) return null;
  const snapshot = homeByUser.get(userId);
  if (!snapshot) return null;
  const invalidFoodItems = hasInvalidCachedFoodItems(snapshot.foodItems);
  return {
    dbUserName: snapshot.dbUserName,
    macros: cloneMacros(snapshot.macros),
    foodItems: invalidFoodItems ? [] : cloneItems(snapshot.foodItems),
    dashboardFetchedAt: snapshot.dashboardFetchedAt,
    foodItemsFetchedAt: invalidFoodItems ? 0 : snapshot.foodItemsFetchedAt,
  };
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
    dashboardFetchedAt: Date.now(),
    foodItemsFetchedAt: current?.foodItemsFetchedAt || 0,
  });
};

export const setCachedHomeFoodItems = (userId: string, foodItems: any[]) => {
  const current = homeByUser.get(userId);
  homeByUser.set(userId, {
    dbUserName: current?.dbUserName || '',
    macros: cloneMacros(current?.macros || null),
    foodItems: cloneItems(foodItems || []),
    dashboardFetchedAt: current?.dashboardFetchedAt || 0,
    foodItemsFetchedAt: Date.now(),
  });
};

export const shouldRefreshHomeDashboard = (userId?: string | null, maxAgeMs = 15_000) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.macros) return true;
  return Date.now() - snapshot.dashboardFetchedAt > maxAgeMs;
};

export const shouldRefreshHomeFoodItems = (userId?: string | null, maxAgeMs = 30 * 60_000) => {
  if (!userId) return false;
  const snapshot = homeByUser.get(userId);
  if (!snapshot?.foodItems?.length) return true;
  if (hasInvalidCachedFoodItems(snapshot.foodItems)) return true;
  return Date.now() - snapshot.foodItemsFetchedAt > maxAgeMs;
};
