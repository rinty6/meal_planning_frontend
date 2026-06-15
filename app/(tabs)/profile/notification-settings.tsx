// Profile notification settings page.
// This file exists so the master enable/disable switch is separate from the
// notification inbox, making Profile notifications less confusing to navigate.

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { authedFetch } from '../../../services/authedFetch';

const NotificationSettingsScreen = () => {
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);

  const [masterEnabled, setMasterEnabled] = useState(true);
  const [loadingPref, setLoadingPref] = useState(true);
  const [togglingPref, setTogglingPref] = useState(false);

  getTokenRef.current = getToken;

  const loadPreferences = useCallback(async () => {
    if (!userId) return;
    setLoadingPref(true);
    try {
      const response = await authedFetch(`/api/notifications/preferences/${userId}`, {
        getToken: getTokenRef.current,
        clerkId: userId,
      });
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data?.notificationsMasterEnabled === 'boolean') {
        setMasterEnabled(data.notificationsMasterEnabled);
      }
    } catch (error) {
      console.warn('Failed to load notification preferences:', error);
    } finally {
      setLoadingPref(false);
    }
  }, [userId]);

  const ensureOsPermissionGranted = useCallback(async () => {
    try {
      const Notifications = await import('expo-notifications');
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') return true;
      const requested = await Notifications.requestPermissionsAsync();
      if (requested.status === 'granted') return true;
      Alert.alert(
        'Allow notifications',
        'Notifications are turned off for GoodHealthMate in your device settings. Open Settings to enable them.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    } catch (error) {
      console.warn('OS permission check failed:', error);
      return true;
    }
  }, []);

  const toggleMaster = useCallback(
    async (next: boolean) => {
      if (!userId || togglingPref) return;
      const previous = masterEnabled;
      setMasterEnabled(next);
      setTogglingPref(true);
      try {
        if (next) {
          const allowed = await ensureOsPermissionGranted();
          if (!allowed) {
            setMasterEnabled(previous);
            return;
          }
        }

        const response = await authedFetch(`/api/notifications/preferences/${userId}`, {
          method: 'PUT',
          getToken,
          clerkId: userId,
          body: JSON.stringify({ clerkId: userId, enabled: next }),
        });
        if (!response.ok) throw new Error(`status ${response.status}`);
      } catch (error) {
        console.warn('Failed to update notification preference:', error);
        setMasterEnabled(previous);
        Alert.alert('Error', 'Could not update your notification setting. Please try again.');
      } finally {
        setTogglingPref(false);
      }
    },
    [ensureOsPermissionGranted, getToken, masterEnabled, togglingPref, userId]
  );

  useFocusEffect(
    useCallback(() => {
      void loadPreferences();
    }, [loadPreferences])
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F3F4F6]">
      <View className="px-5 py-4 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text className="text-xl font-bold flex-1 text-[#111827]">Notification Settings</Text>
      </View>

      {loadingPref ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <View className="px-5 pt-5">
          <View className="rounded-2xl border border-gray-200 bg-white p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-bold text-[#1F2937]">Enable Notifications</Text>
                <Text className="text-sm text-[#64748B] mt-1 leading-5">
                  Turn all GoodHealthMate notifications on or off. When off, you will not
                  receive meal reminders or calorie goal updates.
                </Text>
              </View>
              <Switch
                value={masterEnabled}
                onValueChange={toggleMaster}
                disabled={togglingPref}
                trackColor={{ false: '#CBD5E1', true: '#2563EB' }}
              />
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default NotificationSettingsScreen;
