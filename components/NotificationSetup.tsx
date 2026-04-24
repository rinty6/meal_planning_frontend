// This file helps register for, send, and
// receive push notifications in a React Native app.

import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { markNotificationsDirty } from '../services/notificationsStore';

let lastRegisteredDeviceKey: string | null = null;
let notificationHandlerConfigured = false;
let notificationsModulePromise: Promise<typeof import('expo-notifications') | null> | null = null;

function isExpoGoPushUnsupported() {
  return Constants.appOwnership === 'expo' && Platform.OS === 'android';
}

async function loadNotificationsModule() {
  if (isExpoGoPushUnsupported()) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').then((notifications) => {
      if (!notificationHandlerConfigured) {
        notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        notificationHandlerConfigured = true;
      }

      return notifications;
    });
  }

  return notificationsModulePromise;
}

export default function NotificationSetup() {
  const { userId, getToken } = useAuth(); // clerkId

  useEffect(() => {
    let isMounted = true;
    let receivedSubscription: { remove: () => void } | null = null;
    let responseSubscription: { remove: () => void } | null = null;

    const setupNotifications = async () => {
      const notifications = await loadNotificationsModule();
      if (!isMounted || !notifications) {
        return;
      }

      receivedSubscription = notifications.addNotificationReceivedListener(() => {
        if (userId) {
          markNotificationsDirty(userId);
        }
      });
      responseSubscription = notifications.addNotificationResponseReceivedListener(() => {
        if (userId) {
          markNotificationsDirty(userId);
        }
      });

      const token = await registerForPushNotificationsAsync(notifications);
      if (!isMounted || !token || !userId) return;
      const registrationKey = `${userId}:${token}`;
      if (lastRegisteredDeviceKey === registrationKey) return;
      const authToken = await getToken();
      await saveTokenToBackend(userId, token, authToken || '');
      lastRegisteredDeviceKey = registrationKey;
    };

    setupNotifications().catch((error) => {
      console.error('Notification setup error:', error);
    });

    return () => {
      isMounted = false;
      receivedSubscription?.remove();
      responseSubscription?.remove();
    };
  }, [userId, getToken]);

  const saveTokenToBackend = async (clerkId: string, token: string, authToken: string) => {
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      await fetch(`${apiURL}/api/devices/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          'x-clerk-id': clerkId,
        },
        body: JSON.stringify({
          clerkId,
          pushToken: token,
          platform: Platform.OS,
        }),
      });
    } catch (error) {
      console.error("Error saving push token:", error);
    }
  };

  async function registerForPushNotificationsAsync(notifications: typeof import('expo-notifications')) {
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }

      const owner = Constants.expoConfig?.owner;
      const slug = Constants.expoConfig?.slug;
      const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
      // Prefer runtime/eas projectId over app.json static value.
      const projectId = envProjectId || Constants.easConfig?.projectId;
      const envExperienceId = process.env.EXPO_PUBLIC_EXPERIENCE_ID?.trim();
      const fallbackExperienceId = envExperienceId || (owner && slug ? `@${owner}/${slug}` : undefined);
      const isExpoGo = Constants.appOwnership === 'expo';

      const attempts: { label: string; options?: Record<string, string> }[] = [];
      if (isExpoGo) {
        // Expo Go generally resolves best with experienceId.
        if (fallbackExperienceId) attempts.push({ label: `experienceId:${fallbackExperienceId}`, options: { experienceId: fallbackExperienceId } });
        if (projectId) attempts.push({ label: `projectId:${projectId}`, options: { projectId } });
      } else {
        // Dev client / standalone generally resolves best with projectId.
        if (projectId) attempts.push({ label: `projectId:${projectId}`, options: { projectId } });
        if (fallbackExperienceId) attempts.push({ label: `experienceId:${fallbackExperienceId}`, options: { experienceId: fallbackExperienceId } });
      }
      attempts.push({ label: 'default' });

      const errors: string[] = [];
      for (const attempt of attempts) {
        try {
          const response = attempt.options
            ? await notifications.getExpoPushTokenAsync(attempt.options as any)
            : await notifications.getExpoPushTokenAsync();

          if (response?.data) {
            return response.data;
          }
        } catch (error: any) {
          errors.push(`${attempt.label} -> ${String(error?.message || error)}`);
        }
      }

      console.error('Push token fetch failed after all attempts.', {
        appOwnership: Constants.appOwnership,
        owner,
        slug,
        hasProjectId: !!projectId,
        hasExperienceId: !!fallbackExperienceId,
        errors,
      });
      return null;
    } else {
      console.log('Must use physical device for Push Notifications');
      return null;
    }
  }

  return null; 
}
