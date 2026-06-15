// Profile route wrapper for the shared notification inbox.
// The inbox itself lives in components/notificationmessage.tsx so Home and
// Profile can show the same messages without sharing navigation state.

import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import NotificationMessage from '../../../components/notificationmessage';

const NotificationMessagesScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-[#F3F4F6]">
      <NotificationMessage
        title="Notification Messages"
        closeIcon="arrow-back"
        onClose={() => router.back()}
      />
    </SafeAreaView>
  );
};

export default NotificationMessagesScreen;
