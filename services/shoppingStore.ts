import { authedFetch, type GetToken } from "./authedFetch";

export type ShoppingListSummary = {
  id: number;
  userId?: number;
  title: string;
  createdAt?: string;
  itemCount?: number;
};

export type ShoppingItem = {
  id: number;
  listId: number;
  name: string;
  isChecked: boolean;
};

type ShoppingListsSnapshot = {
  lists: ShoppingListSummary[];
  fetchedAt: number;
  dirty: boolean;
};

type ShoppingItemsSnapshot = {
  items: ShoppingItem[];
  fetchedAt: number;
  dirty: boolean;
};

const listsByUser = new Map<string, ShoppingListsSnapshot>();
const itemsByList = new Map<string, ShoppingItemsSnapshot>();
const inFlightListFetches = new Map<string, Promise<ShoppingListSummary[] | null>>();
const inFlightItemFetches = new Map<string, Promise<ShoppingItem[] | null>>();

const unicodeFractionPattern = String.raw`\u00BC\u00BD\u00BE\u2153\u2154\u215B\u215C\u215D\u215E`;
const amountPattern = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[${unicodeFractionPattern}])`;
const rangePattern = `${amountPattern}(?:\\s*(?:-|to)\\s*${amountPattern})?`;
const unitPattern = String.raw`(?:(?:cups?|cupfuls?|tablespoons?|tbsp|teaspoons?|tsp|grams?|grammes?|g|kilograms?|kg|milliliters?|millilitres?|ml|liters?|litres?|l|ounces?|oz|pounds?|lbs?|cloves?|cans?|tins?|jars?|packets?|packages?|pinches?|dashes?|handfuls?|bunches?|sprigs?|slices?|pieces?|sticks?)\b)`;
const measurePrefixPattern = new RegExp(
  `^\\s*(?:(?:about|approx\\.?|approximately|around)\\s+)?${rangePattern}\\s*(?:${unitPattern})?\\.?\\s*(?:of\\s+)?`,
  "i"
);
const unitOnlyPrefixPattern = new RegExp(
  `^\\s*(?:a|an|one)\\s+${unitPattern}\\.?\\s*(?:of\\s+)?`,
  "i"
);

export const cleanShoppingItemName = (value: unknown) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const cleaned = text
    .replace(measurePrefixPattern, "")
    .replace(unitOnlyPrefixPattern, "")
    .trim();

  return cleaned || text;
};

const normalizeList = (list: any): ShoppingListSummary => ({
  ...list,
  id: Number(list.id),
  itemCount: Number(list.itemCount) || 0,
});

const normalizeItem = (item: any): ShoppingItem => ({
  ...item,
  id: Number(item.id),
  listId: Number(item.listId),
  name: cleanShoppingItemName(item.name),
  isChecked: Boolean(item.isChecked),
});

const cloneLists = (lists: ShoppingListSummary[]) =>
  lists.map((list) => ({ ...list }));

const cloneItems = (items: ShoppingItem[]) =>
  items.map((item) => ({ ...item }));

const buildItemsKey = (userId: string, listId: string | number) =>
  `${userId}|${String(listId)}`;

export const getCachedShoppingLists = (
  userId?: string | null
): ShoppingListsSnapshot | null => {
  if (!userId) return null;
  const snapshot = listsByUser.get(userId);
  if (!snapshot) return null;
  return {
    lists: cloneLists(snapshot.lists),
    fetchedAt: snapshot.fetchedAt,
    dirty: snapshot.dirty,
  };
};

export const setCachedShoppingLists = (
  userId: string,
  lists: ShoppingListSummary[]
) => {
  listsByUser.set(userId, {
    lists: cloneLists(lists.map(normalizeList)),
    fetchedAt: Date.now(),
    dirty: false,
  });
};

export const markShoppingListsDirty = (userId?: string | null) => {
  if (!userId) return;
  const snapshot = listsByUser.get(userId);
  if (!snapshot) {
    listsByUser.set(userId, { lists: [], fetchedAt: 0, dirty: true });
    return;
  }
  listsByUser.set(userId, { ...snapshot, dirty: true });
};

export const shouldRefreshShoppingLists = (
  userId?: string | null,
  maxAgeMs = 60_000
) => {
  if (!userId) return false;
  const snapshot = listsByUser.get(userId);
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};

export const removeCachedShoppingList = (
  userId: string,
  listId: string | number
) => {
  const snapshot = listsByUser.get(userId);
  if (!snapshot) return;
  listsByUser.set(userId, {
    ...snapshot,
    lists: snapshot.lists.filter((list) => String(list.id) !== String(listId)),
  });
};

export const changeCachedShoppingListItemCount = (
  userId: string,
  listId: string | number,
  delta: number
) => {
  const snapshot = listsByUser.get(userId);
  if (!snapshot) return;
  listsByUser.set(userId, {
    ...snapshot,
    lists: snapshot.lists.map((list) =>
      String(list.id) === String(listId)
        ? { ...list, itemCount: Math.max(0, (Number(list.itemCount) || 0) + delta) }
        : list
    ),
  });
};

type FetchShoppingListsArgs = {
  userId: string;
  getToken?: GetToken;
  ttlMs?: number;
  force?: boolean;
};

export const fetchShoppingListsWithCache = async ({
  userId,
  getToken,
  ttlMs = 60_000,
  force = false,
}: FetchShoppingListsArgs): Promise<ShoppingListSummary[] | null> => {
  if (!userId) return null;

  if (!force) {
    const cached = listsByUser.get(userId);
    if (cached && !cached.dirty && Date.now() - cached.fetchedAt <= ttlMs) {
      return cloneLists(cached.lists);
    }
  }

  const inFlight = inFlightListFetches.get(userId);
  if (inFlight) return inFlight;

  const pending = (async () => {
    try {
      const response = await authedFetch(`/api/shopping/list/${userId}`, {
        getToken,
        clerkId: userId,
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data)) return null;

      const lists = data.map(normalizeList);
      setCachedShoppingLists(userId, lists);
      return cloneLists(lists);
    } catch {
      return null;
    }
  })();

  inFlightListFetches.set(userId, pending);
  try {
    return await pending;
  } finally {
    if (inFlightListFetches.get(userId) === pending) {
      inFlightListFetches.delete(userId);
    }
  }
};

export const getCachedShoppingItems = (
  userId?: string | null,
  listId?: string | number | null
): ShoppingItemsSnapshot | null => {
  if (!userId || listId == null) return null;
  const snapshot = itemsByList.get(buildItemsKey(userId, listId));
  if (!snapshot) return null;
  return {
    items: cloneItems(snapshot.items),
    fetchedAt: snapshot.fetchedAt,
    dirty: snapshot.dirty,
  };
};

export const setCachedShoppingItems = (
  userId: string,
  listId: string | number,
  items: ShoppingItem[]
) => {
  itemsByList.set(buildItemsKey(userId, listId), {
    items: cloneItems(items.map(normalizeItem)),
    fetchedAt: Date.now(),
    dirty: false,
  });
};

export const clearCachedShoppingItems = (
  userId: string,
  listId: string | number
) => {
  itemsByList.delete(buildItemsKey(userId, listId));
};

export const markShoppingItemsDirty = (
  userId?: string | null,
  listId?: string | number | null
) => {
  if (!userId || listId == null) return;
  const key = buildItemsKey(userId, listId);
  const snapshot = itemsByList.get(key);
  if (!snapshot) {
    itemsByList.set(key, { items: [], fetchedAt: 0, dirty: true });
    return;
  }
  itemsByList.set(key, { ...snapshot, dirty: true });
};

export const shouldRefreshShoppingItems = (
  userId?: string | null,
  listId?: string | number | null,
  maxAgeMs = 60_000
) => {
  if (!userId || listId == null) return false;
  const snapshot = itemsByList.get(buildItemsKey(userId, listId));
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};

type FetchShoppingItemsArgs = {
  userId: string;
  listId: string | number;
  getToken?: GetToken;
  ttlMs?: number;
  force?: boolean;
};

export const fetchShoppingItemsWithCache = async ({
  userId,
  listId,
  getToken,
  ttlMs = 60_000,
  force = false,
}: FetchShoppingItemsArgs): Promise<ShoppingItem[] | null> => {
  if (!userId || listId == null) return null;

  const key = buildItemsKey(userId, listId);
  if (!force) {
    const cached = itemsByList.get(key);
    if (cached && !cached.dirty && Date.now() - cached.fetchedAt <= ttlMs) {
      return cloneItems(cached.items);
    }
  }

  const inFlight = inFlightItemFetches.get(key);
  if (inFlight) return inFlight;

  const pending = (async () => {
    try {
      const response = await authedFetch(`/api/shopping/detail/${listId}`, {
        getToken,
        clerkId: userId,
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!Array.isArray(data)) return null;

      const items = data.map(normalizeItem);
      setCachedShoppingItems(userId, listId, items);
      return cloneItems(items);
    } catch {
      return null;
    }
  })();

  inFlightItemFetches.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inFlightItemFetches.get(key) === pending) {
      inFlightItemFetches.delete(key);
    }
  }
};

export const setCachedShoppingItemChecked = (
  userId: string,
  listId: string | number,
  itemId: number,
  isChecked: boolean
) => {
  const key = buildItemsKey(userId, listId);
  const snapshot = itemsByList.get(key);
  if (!snapshot) return;
  itemsByList.set(key, {
    ...snapshot,
    items: snapshot.items.map((item) =>
      item.id === itemId ? { ...item, isChecked } : item
    ),
  });
};

export const setCachedShoppingItemName = (
  userId: string,
  listId: string | number,
  itemId: number,
  name: string
) => {
  const key = buildItemsKey(userId, listId);
  const snapshot = itemsByList.get(key);
  if (!snapshot) return;
  const cleanedName = cleanShoppingItemName(name);
  itemsByList.set(key, {
    ...snapshot,
    items: snapshot.items.map((item) =>
      item.id === itemId ? { ...item, name: cleanedName } : item
    ),
  });
};

export const removeCachedShoppingItem = (
  userId: string,
  listId: string | number,
  itemId: number
) => {
  const key = buildItemsKey(userId, listId);
  const snapshot = itemsByList.get(key);
  if (!snapshot) return;
  itemsByList.set(key, {
    ...snapshot,
    items: snapshot.items.filter((item) => item.id !== itemId),
  });
};

export const resetCachedShoppingItems = (
  userId: string,
  listId: string | number
) => {
  const key = buildItemsKey(userId, listId);
  const snapshot = itemsByList.get(key);
  if (!snapshot) return;
  itemsByList.set(key, {
    ...snapshot,
    items: snapshot.items.map((item) => ({ ...item, isChecked: false })),
  });
};
