// This file creates the notification page
// It fetch the notification data from the backend
// Show all the notification message from the system

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import {
  type InboxNotification,
  getCachedNotifications,
  markNotificationReadInCache,
  setCachedNotifications,
  shouldRefreshNotifications,
} from '../../../services/notificationsStore';

const NOTIFICATIONS_REFRESH_TTL_MS = 60 * 1000;

const formatRelativeTime = (dateLike: string) => {
  const date = new Date(dateLike);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const NotificationCard = ({
  item,
  onPress,
}: {
  item: InboxNotification;
  onPress: (item: InboxNotification) => void;
}) => {
  const unread = !item.isRead;

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.85}
      className="mb-3 rounded-2xl border p-4"
      style={{
        borderColor: unread ? '#B4D3FF' : '#E5E7EB',
        backgroundColor: unread ? '#F4F8FF' : '#F9FAFB',
      }}
    >
      <View className="flex-row items-start">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: unread ? '#DCEBFF' : '#EEF2F7' }}
        >
          <Ionicons name="notifications-outline" size={18} color="#2563EB" />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-bold text-[#1F2937] pr-2">{item.title}</Text>
            {unread ? <View className="w-2.5 h-2.5 rounded-full bg-blue-500" /> : null}
          </View>
          <Text className="text-sm text-[#475569] mt-1 leading-5">{item.body}</Text>
          <Text className="text-xs text-[#94A3B8] mt-3">{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const NotificationsScreen = () => {
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const inFlightRef = useRef(false);

  const [items, setItems] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const hydrateFromCache = useCallback(() => {
    if (!userId) return;
    const cached = getCachedNotifications(userId);
    if (!cached) return;
    setItems(cached.items);
    setLoading(false);
  }, [userId]);

  const loadNotifications = useCallback(
    async ({
      isRefresh = false,
      showSpinner = true,
      force = false,
    }: {
      isRefresh?: boolean;
      showSpinner?: boolean;
      force?: boolean;
    } = {}) => {
      if (!userId) return;
      if (inFlightRef.current) return;
      if (!force && !shouldRefreshNotifications(userId, NOTIFICATIONS_REFRESH_TTL_MS)) return;

      inFlightRef.current = true;
      if (isRefresh) setRefreshing(true);
      else if (showSpinner) setLoading(true);

      try {
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const token = await getTokenRef.current();
        if (!apiURL || !userId) return;

        const response = await fetch(`${apiURL}/api/notifications/${userId}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-clerk-id': userId,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          const message = `Notification fetch failed: ${response.status}`;
          setErrorMessage(message);
          console.warn(message, errorText);
          return;
        }
        const data = await response.json();
        const nextItems = Array.isArray(data) ? data : [];
        setItems(nextItems);
        setCachedNotifications(userId, nextItems);
        setErrorMessage('');
      } catch (error) {
        setErrorMessage('Failed to load notifications');
        console.warn('Failed to load notifications:', error);
      } finally {
        if (showSpinner) setLoading(false);
        setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [userId]
  );

  useFocusEffect(
    useCallback(() => {
      const cached = getCachedNotifications(userId);
      hydrateFromCache();
      void loadNotifications({ showSpinner: !cached });
    }, [hydrateFromCache, loadNotifications, userId])
  );

  const markAsRead = useCallback(
    async (notificationId: number) => {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const token = await getToken();
      if (!apiURL || !userId) return;

      const response = await fetch(`${apiURL}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-clerk-id': userId,
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Mark-as-read failed:', response.status, errorText);
      }
    },
    [getToken, userId]
  );

  const onPressNotification = useCallback(
    async (item: InboxNotification) => {
      if (!item.isRead) {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        if (userId) {
          markNotificationReadInCache(userId, item.id);
        }
        try {
          await markAsRead(item.id);
        } catch (error) {
          console.warn('Failed to mark notification as read:', error);
        }
      }
    },
    [markAsRead]
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F3F4F6]">
      <View className="px-5 py-4 border-b border-gray-200 flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-[#111827]">Notifications</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} className="p-2">
          <Ionicons name="close" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <>
          {errorMessage ? (
            <View className="mx-4 mt-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
              <Text className="text-red-700 text-sm">{errorMessage}</Text>
            </View>
          ) : null}
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 28 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadNotifications({ isRefresh: true, showSpinner: false, force: true })}
                tintColor="#2563EB"
              />
            }
            renderItem={({ item }) => (
              <NotificationCard item={item} onPress={onPressNotification} />
            )}
            ListEmptyComponent={
              <View className="mt-20 items-center px-8">
                <Ionicons name="notifications-off-outline" size={30} color="#94A3B8" />
                <Text className="text-gray-500 mt-3 text-center">
                  No notifications yet. We will show alerts here when available.
                </Text>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
};

export default NotificationsScreen;
