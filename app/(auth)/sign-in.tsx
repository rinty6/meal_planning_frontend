import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';

import AuthSocialButtons from '../../components/AuthSocialButtons';
import Button from '../../components/Button';
import CustomAlert from '../../components/customAlert';
import TextInputArea from '../../components/TextInput';
import { setRecoveryEmail } from '../../utils/recoveryHandoff';
import {
  readClerkError,
  isTransportFailure,
  TRANSPORT_MESSAGE,
  MFA_MESSAGE,
} from '../../utils/clerkErrors';

const SignInScreen = () => {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /** Sign-in and social buttons only. Recovery owns its own busy state. */
  const [loading, setLoading] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertData, setAlertData] = useState({ title: '', message: '' });

  const signInInFlightRef = useRef(false);

  const showSimpleAlert = (title: string, message: string) => {
    setAlertData({ title, message });
    setAlertVisible(true);
  };

  /**
   * Recovery is a route now, not a modal. The prefill goes through module state
   * rather than a route param so the address never lands in a URL — see
   * utils/recoveryHandoff.ts.
   */
  const openRecovery = useCallback(
    (prefill: string) => {
      setRecoveryEmail(prefill);
      router.push('/(auth)/reset-password');
    },
    [router]
  );

  const openSignedInApp = async (signInResult: any) => {
    if (signInResult?.status === 'complete' && signInResult.createdSessionId) {
      if (setActive) {
        await setActive({ session: signInResult.createdSessionId });
      }
      router.replace('/');
      return true;
    }

    return false;
  };

  const handleSignIn = async () => {
    if (signInInFlightRef.current) return;

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      showSimpleAlert('Warning', 'Please fill in all the fields');
      return;
    }

    if (!isLoaded || !signIn) return;

    signInInFlightRef.current = true;
    setLoading(true);

    try {
      let attempt = await signIn.create({ identifier: normalizedEmail, password });

      if (attempt.status === 'needs_first_factor') {
        attempt = await signIn.attemptFirstFactor({ strategy: 'password', password });
      }

      if (await openSignedInApp(attempt)) {
        return;
      }

      // Clerk requires a reset before this account can sign in. Recovery is
      // exactly the flow for that, so hand straight over instead of dead-ending.
      if (attempt.status === 'needs_new_password') {
        openRecovery(normalizedEmail);
        return;
      }

      if (attempt.status === 'needs_second_factor') {
        showSimpleAlert('Verification Required', MFA_MESSAGE);
        return;
      }

      showSimpleAlert('Error', 'Sign in could not be completed. Please try again.');
    } catch (error: unknown) {
      const info = readClerkError(error);
      showSimpleAlert(
        'Error',
        isTransportFailure(info)
          ? TRANSPORT_MESSAGE
          : info.message || 'Sign in failed. Please check your email and password again.'
      );
    } finally {
      signInInFlightRef.current = false;
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
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
            />
            <TextInputArea
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              isPassword={true}
              secureTextEntry={!showPassword}
              isPasswordVisible={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
            />

            <TouchableOpacity
              onPress={() => openRecovery(email.trim().toLowerCase())}
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
          </ScrollView>
        </View>

        {/* Both Modals live outside the ScrollView. A Modal nested in a scroll
            container is the same class of iOS bug as stacking two Modals
            (ERROR_LOG Errors 019 and 055). */}

        {/* No Pip: a wrong-password or account error before the user is even
            signed in would read as the mascot judging them at the door. */}
        <CustomAlert
          visible={alertVisible}
          title={alertData.title}
          message={alertData.message}
          confirmText="Close"
          pip="none"
          onConfirm={() => setAlertVisible(false)}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default SignInScreen;
