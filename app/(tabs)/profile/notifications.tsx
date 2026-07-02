// Profile notification hub.
// This screen intentionally only offers two choices: settings or messages.
// Keeping those jobs separate avoids Home's notification shortcut leaving the
// Profile tab stuck on an inbox/settings child screen.

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const NotificationsScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-[#F3F4F6]" edges={['top', 'left', 'right']}>
      <View className="px-5 py-4 border-b border-gray-200 flex-row items-center justify-between">
        <Text className="text-3xl font-bold text-[#111827]">Notifications</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')} className="p-2">
          <Ionicons name="close" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View className="px-5 pt-5">
        <Text className="text-sm text-[#64748B] leading-5 mb-4">
          Choose what you want to manage. Settings control whether reminders can be sent;
          messages show the notifications GoodHealthMate has already created for you.
        </Text>

        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile/notification-settings')}
          activeOpacity={0.85}
          className="mb-4 rounded-2xl border border-gray-200 bg-white p-4"
        >
          <View className="flex-row items-center">
            <View className="w-11 h-11 rounded-xl bg-blue-100 items-center justify-center mr-4">
              <Ionicons name="options-outline" size={22} color="#2563EB" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-[#1F2937]">Notification Settings</Text>
              <Text className="text-sm text-[#64748B] mt-1 leading-5">
                Turn all meal reminders and calorie updates on or off.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile/notification-messages')}
          activeOpacity={0.85}
          className="rounded-2xl border border-gray-200 bg-white p-4"
        >
          <View className="flex-row items-center">
            <View className="w-11 h-11 rounded-xl bg-orange-100 items-center justify-center mr-4">
              <Ionicons name="notifications-outline" size={22} color="#F97316" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-[#1F2937]">Notification Messages</Text>
              <Text className="text-sm text-[#64748B] mt-1 leading-5">
                View reminders, goal updates, and app alerts in one inbox.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default NotificationsScreen;
