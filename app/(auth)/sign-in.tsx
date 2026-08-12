import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk, useSignIn } from '@clerk/clerk-expo';

import AuthSocialButtons from '../../components/AuthSocialButtons';
import Button from '../../components/Button';
import CustomAlert from '../../components/customAlert';
import ForgotPasswordModal, { type RecoveryActionResult } from '../../components/ForgotPasswordModal';
import TextInputArea from '../../components/TextInput';

/**
 * Clerk error codes that mean "throttled or blocked", not "no such account".
 * These must never be folded into the neutral reset acknowledgment — doing so
 * tells the user a code is coming when Clerk refused to send one.
 */
const THROTTLE_CODES = new Set([
  'user_locked',
  'action_blocked',
  'user_banned',
  'rate_limit_exceeded',
  'too_many_requests',
  'signup_rate_limit_exceeded',
]);

type ClerkErrorInfo = {
  status?: number;
  code?: string;
  message?: string;
};

const readClerkError = (error: unknown): ClerkErrorInfo => {
  const err = error as { status?: unknown; errors?: { code?: string; message?: string; longMessage?: string }[] };
  const first = Array.isArray(err?.errors) ? err.errors[0] : undefined;
  return {
    status: typeof err?.status === 'number' ? err.status : undefined,
    code: first?.code,
    message: first?.longMessage || first?.message,
  };
};

/** No HTTP status and no Clerk error body means the request never landed. */
const isTransportFailure = (info: ClerkErrorInfo) => info.status === undefined && info.code === undefined;

const isThrottled = (info: ClerkErrorInfo) =>
  info.status === 429 || (!!info.code && THROTTLE_CODES.has(info.code)) || (!!info.code && info.code.includes('rate_limit'));

const TRANSPORT_MESSAGE = 'Could not reach the server. Check your connection and try again.';
const SERVICE_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';
const NOT_READY_MESSAGE = 'Still connecting. Try again in a moment.';
/**
 * MFA during recovery is not handled in P0. "Start over" would loop the user
 * through the same wall forever, so this points somewhere that can actually
 * help instead.
 */
const MFA_MESSAGE =
  'This account uses two-factor authentication, which we cannot reset in the app yet. Please contact support.';

const SignInScreen = () => {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signOut } = useClerk();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  /** Sign-in and social buttons only. Recovery owns its own busy state. */
  const [loading, setLoading] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertData, setAlertData] = useState({ title: '', message: '' });
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');

  const signInInFlightRef = useRef(false);

  const showSimpleAlert = (title: string, message: string) => {
    setAlertData({ title, message });
    setAlertVisible(true);
  };

  const openRecovery = useCallback((prefill: string) => {
    setRecoveryEmail(prefill);
    setResetModalVisible(true);
  }, []);

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

  /**
   * Registered, unregistered, and social-only addresses all get the same
   * acknowledgment — anything else lets an attacker enumerate accounts, and
   * Clerk confirms social users can exist with no password at all. Throttling
   * and outages are the deliberate exceptions: they are not account facts.
   */
  const handleRequestCode = useCallback(
    async (targetEmail: string): Promise<RecoveryActionResult> => {
      if (!isLoaded || !signIn) {
        return { kind: 'field', field: 'form', message: NOT_READY_MESSAGE };
      }

      try {
        await signIn.create({ strategy: 'reset_password_email_code', identifier: targetEmail });
        return { kind: 'ok' };
      } catch (error: unknown) {
        const info = readClerkError(error);

        if (isTransportFailure(info)) {
          return { kind: 'field', field: 'form', message: TRANSPORT_MESSAGE };
        }
        if (isThrottled(info)) {
          return { kind: 'lockout', message: info.message || 'Too many attempts. Please try again later.' };
        }
        if (info.status !== undefined && info.status >= 500) {
          return { kind: 'field', field: 'form', message: SERVICE_MESSAGE };
        }
        // Remaining 4xx are account-existence / capability facts. Stay neutral.
        return { kind: 'ok' };
      }
    },
    [isLoaded, signIn]
  );

  /**
   * Signs out the session `resetPassword` created. It is never activated, so it
   * is invisible in-flow — but Clerk's initial-session selector picks it up on
   * the next app launch and would silently sign the user in.
   */
  const cleanupRecoverySession = useCallback(async (createdSessionId?: string | null): Promise<RecoveryActionResult> => {
    // Prefer the id from the call that just completed; fall back to the hook's
    // resource for the retry path, where the attempt is already `complete`.
    const sessionId = createdSessionId ?? signIn?.createdSessionId;
    if (!sessionId) return { kind: 'ok' };

    try {
      await signOut({ sessionId });
      return { kind: 'ok' };
    } catch {
      return {
        kind: 'session_cleanup',
        message: 'Your password was reset. We could not finish signing this device out.',
      };
    }
  }, [signIn, signOut]);

  /**
   * STEP 1 of the two-step reset: prove the code, nothing else.
   *
   * `password` is deliberately omitted from the attempt — it is optional on
   * `ResetPasswordEmailCodeAttempt`, and leaving it off is what lets the code
   * be verified on its own screen. Clerk answers `needs_new_password`, which the
   * password step then picks up.
   *
   * Idempotent: if the attempt is already past first factor (the user backed up
   * to this screen, or a retry re-entered here), the code is not resubmitted.
   */
  const handleVerifyCode = useCallback(
    async (code: string): Promise<RecoveryActionResult> => {
      if (!isLoaded || !signIn) {
        return { kind: 'field', field: 'form', message: NOT_READY_MESSAGE };
      }

      // Already verified. Resubmitting a spent code would fail for the wrong
      // reason and strand the user on a screen they have already cleared.
      if (signIn.status === 'needs_new_password') return { kind: 'ok' };

      try {
        const verified = await signIn.attemptFirstFactor({
          strategy: 'reset_password_email_code',
          code,
        });

        if (verified.status === 'needs_second_factor') {
          return { kind: 'field', field: 'form', message: MFA_MESSAGE };
        }
        if (verified.status !== 'needs_new_password') {
          return {
            kind: 'field',
            field: 'code',
            message: 'That code could not be verified. Request a new one.',
          };
        }
        return { kind: 'ok' };
      } catch (error: unknown) {
        const info = readClerkError(error);

        if (isTransportFailure(info)) {
          return { kind: 'field', field: 'form', message: TRANSPORT_MESSAGE };
        }
        if (isThrottled(info)) {
          return { kind: 'lockout', message: info.message || 'Too many attempts. Please try again later.' };
        }
        if (info.status !== undefined && info.status >= 500) {
          return { kind: 'field', field: 'form', message: SERVICE_MESSAGE };
        }
        // Everything else at this step is a verdict on the code itself.
        return {
          kind: 'field',
          field: 'code',
          message: info.message || 'That code is not valid. Request a new one.',
        };
      }
    },
    [isLoaded, signIn]
  );

  /**
   * STEP 2: spend the verified attempt on a new password.
   *
   * Branches on Clerk's own status so a rejected password never costs the user
   * their code — a weak/breached rejection leaves the attempt at
   * `needs_new_password`, so the retry resubmits only the password. A retry
   * after a cleanup failure sits at `complete` and re-runs only the sign-out.
   */
  const handleSetPassword = useCallback(
    async (newPassword: string): Promise<RecoveryActionResult> => {
      if (!isLoaded || !signIn) {
        return { kind: 'field', field: 'form', message: NOT_READY_MESSAGE };
      }

      try {
        let status = signIn.status;
        let createdSessionId: string | null | undefined;

        if (status === 'needs_new_password') {
          const reset = await signIn.resetPassword({
            password: newPassword,
            signOutOfOtherSessions: true,
          });
          status = reset.status;
          createdSessionId = reset.createdSessionId;

          if (status === 'needs_second_factor') {
            return { kind: 'field', field: 'form', message: MFA_MESSAGE };
          }
        }

        if (status === 'complete') {
          return await cleanupRecoverySession(createdSessionId);
        }

        // The attempt is no longer verified — checklist §5: the code is spent,
        // so send them back for a fresh one rather than to a dead code screen.
        return { kind: 'restart', message: 'That code has expired. Request a new one to continue.' };
      } catch (error: unknown) {
        const info = readClerkError(error);

        if (isTransportFailure(info)) {
          return { kind: 'field', field: 'form', message: TRANSPORT_MESSAGE };
        }
        if (isThrottled(info)) {
          return { kind: 'lockout', message: info.message || 'Too many attempts. Please try again later.' };
        }
        if (info.code === 'form_password_pwned' || info.code === 'form_password_compromised') {
          return {
            kind: 'field',
            field: 'newPassword',
            message: 'This password has appeared in a data breach. Pick something else.',
          };
        }
        if (info.code?.startsWith('form_password')) {
          return {
            kind: 'field',
            field: 'newPassword',
            message: info.message || 'Choose a stronger password.',
          };
        }
        // A code/verification complaint at THIS step means the attempt expired
        // between the two screens. The code is gone; only a new one helps.
        if (info.code?.includes('code') || info.code?.includes('verification')) {
          return {
            kind: 'restart',
            message: info.message || 'That code has expired. Request a new one to continue.',
          };
        }
        if (info.status !== undefined && info.status >= 500) {
          return { kind: 'field', field: 'form', message: SERVICE_MESSAGE };
        }
        return {
          kind: 'field',
          field: 'form',
          message: info.message || 'Recovery could not be completed. Please start again.',
        };
      }
    },
    [isLoaded, signIn, cleanupRecoverySession]
  );

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

        <ForgotPasswordModal
          visible={resetModalVisible}
          initialEmail={recoveryEmail}
          onClose={() => setResetModalVisible(false)}
          onRequestCode={handleRequestCode}
          onVerifyCode={handleVerifyCode}
          onSetPassword={handleSetPassword}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default SignInScreen;
