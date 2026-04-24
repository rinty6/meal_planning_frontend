import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';

import AuthSocialButtons from '../../components/AuthSocialButtons';
import Button from '../../components/Button';
import CustomAlert from '../../components/customAlert';
import ForgotPasswordModal from '../../components/ForgotPasswordModal';
import TextInputArea from '../../components/TextInput';

const SignInScreen = () => {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertData, setAlertData] = useState({ title: '', message: '' });
  const [resetModalVisible, setResetModalVisible] = useState(false);

  const showSimpleAlert = (title: string, message: string) => {
    setAlertData({ title, message });
    setAlertVisible(true);
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      showSimpleAlert('Warning', 'Please fill in all the fields');
      return;
    }

    if (!isLoaded) return;
    setLoading(true);

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/');
      } else {
        showSimpleAlert('Error', 'Sign in failed. Please try again.');
      }
    } catch (error: any) {
      showSimpleAlert(
        'Error',
        error?.errors?.[0]?.message ||
          'Sign in failed. Please check your email and password again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCode = async (targetEmail: string) => {
    if (!targetEmail) {
      showSimpleAlert('Warning', 'Please enter a valid email address.');
      return false;
    }

    setLoading(true);
    try {
      await signIn?.create({
        strategy: 'reset_password_email_code',
        identifier: targetEmail,
      });
      return true;
    } catch (error: any) {
      showSimpleAlert(
        'Error',
        error?.errors?.[0]?.message ||
          'Could not find an account with that email.'
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (code: string, newPassword: string) => {
    if (!code || !newPassword) {
      showSimpleAlert(
        'Warning',
        'Please fill in all fields to reset your password.'
      );
      return;
    }

    setLoading(true);
    try {
      const result = await signIn?.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result?.status === 'complete') {
        await setActive?.({ session: result.createdSessionId });
        setResetModalVisible(false);
        router.replace('/');
      } else {
        showSimpleAlert('Error', 'Failed to reset password.');
      }
    } catch (error: any) {
      showSimpleAlert(
        'Error',
        error?.errors?.[0]?.message || 'Please check your password or username.'
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
      <View className="flex-1 bg-background">
        <View className="h-[30%] bg-secondary items-center justify-center relative w-full">
          <Text className="absolute top-6 left-7 text-3xl">{'\u{1F34E}'}</Text>
          <Text className="absolute top-20 left-16 text-2xl">{'\u{1F34A}'}</Text>
          <Text className="absolute top-16 right-24 text-2xl">{'\u{1F353}'}</Text>
          <Text className="text-4xl">🥑</Text>
          <Text className="absolute top-10 right-10 text-3xl">🍅</Text>
          <Text className="absolute bottom-6 left-9 text-3xl">{'\u{1F34C}'}</Text>
          <Text className="absolute bottom-7 right-16 text-3xl">{'\u{1F347}'}</Text>
          <Text className="absolute bottom-12 right-32 text-2xl">{'\u{1F350}'}</Text>
        </View>

        <View className="flex-1 bg-white -mt-10 rounded-t-[30px] px-6 pt-8 shadow-lg">
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-center text-3xl font-bold text-textPrimary mb-8">
              GoodhealthMate
            </Text>
            <Text className="text-center text-xl font-bold text-textPrimary mb-8">
              Welcome!
            </Text>

            <TextInputArea
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <TextInputArea
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              isPassword={true}
              secureTextEntry={!showPassword}
              isPasswordVisible={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
            />

            <TouchableOpacity
              onPress={() => setResetModalVisible(true)}
              className="items-end mb-6"
            >
              <Text className="text-primary font-semibold">Forgot password?</Text>
            </TouchableOpacity>

            <Button
              title={loading ? 'Logging in...' : 'Login'}
              onPress={handleSignIn}
              disabled={loading}
            />

            <AuthSocialButtons
              loading={loading}
              setLoading={setLoading}
              onError={showSimpleAlert}
            />

            <View className="flex-row justify-center mb-10">
              <Text className="text-textSecondary">Not a member? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
                <Text className="text-primary font-bold">Register now</Text>
              </TouchableOpacity>
            </View>

            <CustomAlert
              visible={alertVisible}
              title={alertData.title}
              message={alertData.message}
              confirmText="Close"
              onConfirm={() => setAlertVisible(false)}
            />

            <ForgotPasswordModal
              visible={resetModalVisible}
              loading={loading}
              onClose={() => setResetModalVisible(false)}
              onRequestCode={handleRequestCode}
              onVerify={handleResetPassword}
            />
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default SignInScreen;
