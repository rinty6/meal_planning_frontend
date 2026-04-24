type FavoriteCollections = {
  favoriteFoods: any[];
  savedRecipes: any[];
};

type FavoriteSnapshot = FavoriteCollections & {
  fetchedAt: number;
  dirty: boolean;
};

const favoritesByUser = new Map<string, FavoriteSnapshot>();

const cloneItems = (items: any[]) => items.map((item) => ({ ...item }));

const buildSnapshot = (
  collections: FavoriteCollections,
  dirty = false,
  fetchedAt = Date.now()
): FavoriteSnapshot => ({
  favoriteFoods: cloneItems(collections.favoriteFoods || []),
  savedRecipes: cloneItems(collections.savedRecipes || []),
  fetchedAt,
  dirty,
});

export const getCachedFavorites = (userId?: string | null): FavoriteSnapshot | null => {
  if (!userId) return null;
  const snapshot = favoritesByUser.get(userId);
  if (!snapshot) return null;
  return buildSnapshot(snapshot, snapshot.dirty, snapshot.fetchedAt);
};

export const setCachedFavorites = (userId: string, collections: FavoriteCollections) => {
  favoritesByUser.set(userId, buildSnapshot(collections));
};

export const markFavoritesDirty = (userId?: string | null) => {
  if (!userId) return;
  const snapshot = favoritesByUser.get(userId);
  if (!snapshot) {
    favoritesByUser.set(
      userId,
      buildSnapshot({ favoriteFoods: [], savedRecipes: [] }, true, 0)
    );
    return;
  }
  favoritesByUser.set(userId, { ...snapshot, dirty: true });
};

export const shouldRefreshFavorites = (userId?: string | null, maxAgeMs = 60_000) => {
  if (!userId) return false;
  const snapshot = favoritesByUser.get(userId);
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};
