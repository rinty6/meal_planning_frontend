// Profile route wrapper for the shared feedback sender.
// The real form lives in components/feedbacksendingmessage.tsx so Home and
// Profile use one submit flow instead of two copies.

import React, { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import FeedbackSendingMessage from '../../../components/feedbacksendingmessage';

const FeedbackScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({ tabBarStyle: { display: 'none' } });

      return () => {
        parent?.setOptions({
          tabBarStyle: {
            backgroundColor: '#0B2149',
            borderTopWidth: 0,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
          },
        });
      };
    }, [navigation])
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      <FeedbackSendingMessage
        onClose={() => router.back()}
        onSubmitted={() => router.back()}
      />
    </SafeAreaView>
  );
};

export default FeedbackScreen;
