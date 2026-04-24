import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignUp } from '@clerk/clerk-expo';

import Button from '../../components/Button';
import CustomAlert from '../../components/customAlert';
import TextInputArea from '../../components/TextInput';

interface VerifySearchParams {
  email?: string;
}

const VerifyEmailScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { email } = params as unknown as VerifySearchParams;
  const { isLoaded, signUp, setActive } = useSignUp();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertData, setAlertData] = useState({ title: '', message: '' });

  const showSimpleAlert = (title: string, message: string) => {
    setAlertData({ title, message });
    setAlertVisible(true);
  };

  const handleResendCode = async () => {
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      showSimpleAlert('Sent!', 'A new code has been sent to your email.');
    } catch (error: any) {
      showSimpleAlert(
        'Error',
        error?.errors?.[0]?.message || 'Could not send code.'
      );
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;

    if (!code) {
      showSimpleAlert('Error', 'Please enter the verification code.');
      return;
    }

    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete' && completeSignUp.createdSessionId) {
        await setActive({ session: completeSignUp.createdSessionId });
        router.replace('/');
      } else {
        console.error(JSON.stringify(completeSignUp, null, 2));
        showSimpleAlert(
          'Verification Failed',
          'Session creation failed. Please try logging in.'
        );
      }
    } catch (error: any) {
      console.error(JSON.stringify(error, null, 2));
      showSimpleAlert(
        'Error',
        error?.errors?.[0]?.message || 'Verification failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        className="bg-background px-6 pt-20"
      >
        <View className="mt-10 mb-8 items-center">
          <Text className="text-3xl font-bold text-textPrimary mb-4">
            Verify Email
          </Text>
          <Text className="text-textSecondary text-center text-base px-4">
            We&apos;ve sent a verification code to
          </Text>
          <Text className="text-primary font-bold text-lg mt-1">
            {email || 'your email address'}
          </Text>
        </View>

        <View className="mt-4">
          <Text className="font-bold mb-2 ml-1 text-textPrimary">
            Verification Code
          </Text>
          <TextInputArea
            placeholder="Enter 6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity
          onPress={handleResendCode}
          className="mt-4 mb-4 items-center"
        >
          <Text className="text-primary font-bold text-base mt-4">
            Resend code
          </Text>
        </TouchableOpacity>

        <View className="mt-8">
          <Button
            title={loading ? 'Verifying...' : 'Verify Account'}
            onPress={handleVerify}
            disabled={loading}
          />
        </View>

        <CustomAlert
          visible={alertVisible}
          title={alertData.title}
          message={alertData.message}
          onConfirm={() => setAlertVisible(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default VerifyEmailScreen;
