// Reusable feedback form for both Profile and the Home feedback shortcut.
// It keeps the send-message logic in one place, and shows success as a full
// replacement screen so Home does not stack native modals and flash black.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@clerk/clerk-expo';
import { submitAppFeedback } from '../services/feedbackAPI';

type FeedbackSendingMessageProps = {
  onClose: () => void;
  onSubmitted?: () => void;
  closeIcon?: keyof typeof Ionicons.glyphMap;
  title?: string;
};

type AlertConfig = {
  title: string;
  message: string;
  confirmText: string;
  variant: 'default' | 'success';
  onConfirm: () => void;
};

const FeedbackSendingMessage = ({
  onClose,
  onSubmitted,
  closeIcon = 'arrow-back',
  title = 'Feedback',
}: FeedbackSendingMessageProps) => {
  const { userId, getToken } = useAuth();
  const [feedback, setFeedback] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    title: '',
    message: '',
    confirmText: 'OK',
    variant: 'default',
    onConfirm: () => {},
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!feedback.trim() && !imageUri) {
      setAlertConfig({
        title: 'Wait a second',
        message: 'Please type some feedback or attach an image before submitting.',
        confirmText: 'OK',
        variant: 'default',
        onConfirm: () => setAlertVisible(false),
      });
      setAlertVisible(true);
      return;
    }

    setSubmitting(true);
    try {
      await submitAppFeedback({
        feedbackText: feedback,
        imageUri,
        getToken,
        clerkId: userId,
      });

      setAlertConfig({
        title: '',
        message: '',
        confirmText: 'OK',
        variant: 'default',
        onConfirm: () => {},
      });
      Keyboard.dismiss();
      setAlertVisible(false);
      setFeedback('');
      setImageUri(null);
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setAlertConfig({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to send feedback. Please try again.',
        confirmText: 'OK',
        variant: 'default',
        onConfirm: () => setAlertVisible(false),
      });
      setAlertVisible(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View className="flex-1 bg-white px-6 justify-center">
        <View className="items-center">
          <View className="w-20 h-20 bg-primary rounded-full items-center justify-center mb-6">
            <Ionicons name="checkmark" size={42} color="white" />
          </View>
          <Text className="text-2xl font-bold text-gray-900 text-center mb-3">
            Thank You!
          </Text>
          <Text className="text-base text-gray-500 text-center leading-6 mb-10">
            Your feedback has been sent to developers. We appreciate your help!
          </Text>
          <TouchableOpacity
            onPress={onSubmitted ?? onClose}
            className="bg-primary py-4 rounded-full items-center w-full"
          >
            <Text className="text-white font-bold text-lg">OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      className="flex-1 bg-white"
    >
      <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
        <TouchableOpacity onPress={onClose} className="mr-4">
          <Ionicons name={closeIcon} size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-xl font-bold flex-1">{title}</Text>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Text className="text-base text-gray-600 mb-4">
            Spotted a bug? Have an idea for a new feature? Let us know below!
          </Text>

          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-800 h-40 mb-4"
            placeholder="Type your feedback here..."
            multiline
            textAlignVertical="top"
            value={feedback}
            onChangeText={setFeedback}
            blurOnSubmit={false}
          />

          {imageUri ? (
            <View className="relative mb-6 self-start">
              <Image source={{ uri: imageUri }} className="w-24 h-40 rounded-xl" />
              <TouchableOpacity
                onPress={() => setImageUri(null)}
                className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
              >
                <Ionicons name="close" size={16} color="white" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickImage}
              className="flex-row items-center self-start bg-blue-50 px-4 py-2 rounded-lg mb-6"
            >
              <Ionicons name="image-outline" size={20} color="#007BFF" />
              <Text className="text-primary font-bold ml-2">Attach Screenshot</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={Keyboard.dismiss}
            className="self-start mb-6"
            activeOpacity={0.7}
          >
            <Text className="text-sm font-semibold text-gray-500">Dismiss keyboard</Text>
          </TouchableOpacity>

          <View className="mt-auto pt-4">
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className="bg-primary py-4 rounded-full items-center shadow-sm"
            >
              {submitting ? (
                <ActivityIndicator color="white" size="large" />
              ) : (
                <Text className="text-white font-bold text-lg">Submit Feedback</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      {alertVisible ? (
        <View style={styles.alertOverlay}>
          <View
            className={`bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl ${
              alertConfig.variant === 'success' ? 'items-center' : ''
            }`}
          >
            {alertConfig.variant === 'success' ? (
              <View className="w-16 h-16 bg-primary rounded-full items-center justify-center mb-4">
                <Ionicons name="checkmark" size={32} color="white" />
              </View>
            ) : null}

            <Text className="text-xl font-bold text-center text-gray-900 mb-2">
              {alertConfig.title}
            </Text>
            <Text className="text-gray-500 text-center mb-6 leading-5">
              {alertConfig.message}
            </Text>
            <TouchableOpacity
              onPress={alertConfig.onConfirm}
              className={`bg-primary py-3 items-center w-full ${
                alertConfig.variant === 'success' ? 'rounded-full' : 'rounded-xl'
              }`}
            >
              <Text className={`text-white font-bold ${alertConfig.variant === 'success' ? 'text-lg' : ''}`}>
                {alertConfig.confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  alertOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});

export default FeedbackSendingMessage;
