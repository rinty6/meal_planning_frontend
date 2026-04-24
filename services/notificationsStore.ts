export type InboxNotification = {
  id: number;
  userId: number;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationSnapshot = {
  items: InboxNotification[];
  fetchedAt: number;
  dirty: boolean;
};

const notificationsByUser = new Map<string, NotificationSnapshot>();

const cloneItems = (items: InboxNotification[]) => items.map((item) => ({ ...item }));

export const getCachedNotifications = (userId?: string | null): NotificationSnapshot | null => {
  if (!userId) return null;
  const snapshot = notificationsByUser.get(userId);
  if (!snapshot) return null;
  return {
    items: cloneItems(snapshot.items),
    fetchedAt: snapshot.fetchedAt,
    dirty: snapshot.dirty,
  };
};

export const setCachedNotifications = (userId: string, items: InboxNotification[]) => {
  notificationsByUser.set(userId, {
    items: cloneItems(items || []),
    fetchedAt: Date.now(),
    dirty: false,
  });
};

export const markNotificationsDirty = (userId?: string | null) => {
  if (!userId) return;
  const snapshot = notificationsByUser.get(userId);
  if (!snapshot) {
    notificationsByUser.set(userId, {
      items: [],
      fetchedAt: 0,
      dirty: true,
    });
    return;
  }
  notificationsByUser.set(userId, {
    ...snapshot,
    dirty: true,
  });
};

export const markNotificationReadInCache = (userId: string, notificationId: number) => {
  const snapshot = notificationsByUser.get(userId);
  if (!snapshot) return;
  notificationsByUser.set(userId, {
    ...snapshot,
    items: snapshot.items.map((item) =>
      item.id === notificationId ? { ...item, isRead: true } : item
    ),
  });
};

export const shouldRefreshNotifications = (userId?: string | null, maxAgeMs = 60_000) => {
  if (!userId) return false;
  const snapshot = notificationsByUser.get(userId);
  if (!snapshot) return true;
  if (snapshot.dirty) return true;
  return Date.now() - snapshot.fetchedAt > maxAgeMs;
};
