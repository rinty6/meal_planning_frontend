/**
 * CHANGE PASSWORD — dedicated route (P1 phase C).
 *
 * Lifted out of the Modal inside privacy.tsx. That Modal is what made the
 * original bug possible: a `CustomAlert` opened over it was silently dropped by
 * iOS (ERROR_LOG Error 019), so a wrong password produced no message at all. On
 * its own route there is no presented Modal to stack over, and the status card
 * is a plain in-tree overlay.
 *
 * RECOVERY HANDOFF (CP18/CP19) is the one destructive confirm in the feature.
 * Resetting by email starts from the signed-out sign-in screen, so continuing
 * means signing this device out. That is stated plainly, Cancel keeps every
 * typed value, and Confirm clears sensitive state BEFORE calling signOut.
 *
 * PIP: `care` on lockout and on the handoff, `happy` on success, and nothing at
 * all on a credential rejection — wrong current password and weak/breached new
 * password both get plain inline text (§3).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser, useClerk, useSession, useReverification } from '@clerk/clerk-expo';
import InlineStatusOverlay from '../../../components/InlineStatusOverlay';
import PipBird from '../../../components/pip/PipBird';
import { startRecoveryHandoff, clearRecoveryEmail } from '../../../utils/recoveryHandoff';
import {
  startEmailVerification,
  attemptEmailVerification,
  describeProvider,
} from '../../../utils/sessionVerification';
import {
  readClerkError,
  isTransportFailure,
  describeLockout,
  CURRENT_PASSWORD_ERROR_CODES,
  BREACHED_PASSWORD_CODES,
  SERVICE_MESSAGE,
  TRANSPORT_MESSAGE,
} from '../../../utils/clerkErrors';

type FieldKey = 'currentPassword' | 'newPassword' | 'confirmPassword' | 'code' | 'form';

type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * `set` is the social-only case (CP5): `user.passwordEnabled` is false, so there
 * is no current password to ask for and asking for one — which is what this
 * screen used to do — is unanswerable. It opens on an intro instead, verifies
 * identity, and only then collects a password.
 */
type Mode = 'change' | 'set';

type Step = 'intro' | 'verify' | 'form';

/**
 * Reverification can arrive two ways, and they differ in how they finish.
 *
 * `proactive` is CP5's "Verify it's you" — we started it, so when the code is
 * accepted we simply advance to the password form.
 *
 * `reactive` is Clerk interrupting a submit that was already in flight
 * (checklist §4: "run the strongest available factor and then retry the
 * original submit once"). `complete()` is Clerk's own callback and performs
 * that retry, so it must be called rather than resubmitting by hand — calling
 * `user.updatePassword` again would be a second request, not a retry.
 */
type VerifyState = {
  intent: 'proactive' | 'reactive';
  sentTo: string;
  complete?: () => void;
  cancel?: () => void;
};

/** `handoff` and `lockout` wait for the user; `success` auto-dismisses. */
type OverlayKind = 'success' | 'lockout' | 'handoff';

type OverlayState = { kind: OverlayKind; message: string };

const PasswordField = ({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  visible,
  onToggleVisible,
  textContentType,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  visible: boolean;
  onToggleVisible: () => void;
  textContentType: 'password' | 'newPassword';
  returnKeyType: 'next' | 'done';
  onSubmitEditing?: () => void;
}) => (
  <View className="mb-4">
    <Text className="text-sm font-bold text-gray-600 mb-2">{label}</Text>
    <View
      className={`flex-row items-center bg-gray-50 border rounded-xl px-4 py-1 ${
        error ? 'border-error' : 'border-gray-200'
      }`}
    >
      <TextInput
        secureTextEntry={!visible}
        className="flex-1 py-3 text-base"
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      <TouchableOpacity
        onPress={onToggleVisible}
        className="p-2"
        accessibilityRole="button"
        accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
      >
        <Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
    {!!error && <Text className="text-error text-xs mt-1">{error}</Text>}
  </View>
);

const CODE_LENGTH = 6;

const ChangePasswordScreen = () => {
  const router = useRouter();
  const { user, isLoaded: userLoaded, isSignedIn } = useUser();
  const { session } = useSession();
  const { signOut } = useClerk();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState<VerifyState | null>(null);

  /**
   * `passwordEnabled` is the gate (CP5). It is only meaningful once the user
   * resource has loaded, so `step` stays on a spinner until then rather than
   * guessing a mode and flickering between two different screens.
   */
  const mode: Mode = user?.passwordEnabled ? 'change' : 'set';
  const [step, setStep] = useState<Step | null>(null);

  useEffect(() => {
    if (!userLoaded || !user) return;
    // Runs once: only seeds the opening step, never overrides later navigation.
    setStep((current) => current ?? (user.passwordEnabled ? 'form' : 'intro'));
  }, [userLoaded, user]);

  /**
   * Synchronous double-tap guard. `busy` drives the disabled state but React
   * batches it, so two taps in the same frame both pass the check — this ref
   * flips before any await and is what actually blocks the second request.
   */
  const inFlightRef = useRef(false);

  /**
   * `cancel()` rejects the interrupted submit. This ref tells that rejection
   * apart from a real failure so the catch stays quiet — the user chose it, and
   * an error banner would read as something having gone wrong.
   */
  const cancelledReverificationRef = useRef(false);

  /** Clearing only the edited field keeps other errors visible while fixing one. */
  const clearError = useCallback((field: FieldKey) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const clearSensitiveState = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setErrors({});
  }, []);

  /**
   * The raw Clerk call, taking its values as ARGUMENTS rather than closing over
   * state. That matters for reverification: `complete()` retries the *original*
   * request, so the arguments captured when it was first invoked are the ones
   * replayed. Reading from component state instead would risk replaying whatever
   * the fields happened to hold minutes later, after a code round trip.
   */
  const updatePassword = useCallback(
    async (params: { newPassword: string; currentPassword?: string }) => {
      if (!user) throw new Error('missing_user');
      await user.updatePassword({ ...params, signOutOfOtherSessions: true });
    },
    [user]
  );

  /**
   * Wraps the call so Clerk can interrupt it when the session needs reverifying.
   * `onNeedsReverification` is mandatory here: without it the hook falls back to
   * clerk-js's own modal, which does not exist in React Native, so the flow
   * would simply stall.
   */
  const updatePasswordWithReverification = useReverification(updatePassword, {
    onNeedsReverification: ({ level, complete, cancel }) => {
      void (async () => {
        if (!session) {
          cancel();
          setErrors({ form: 'Your session has expired. Please sign in again.' });
          return;
        }
        try {
          const started = await startEmailVerification(session, level ?? 'first_factor');
          if (started.kind === 'already_verified') {
            complete();
            return;
          }
          if (started.kind === 'unsupported') {
            cancel();
            setErrors({
              form: 'We could not confirm your identity in the app. Please contact support.',
            });
            return;
          }
          setCode('');
          setVerify({ intent: 'reactive', sentTo: started.sentTo, complete, cancel });
          setStep('verify');
        } catch (error: unknown) {
          cancel();
          const info = readClerkError(error);
          setErrors({ form: isTransportFailure(info) ? TRANSPORT_MESSAGE : SERVICE_MESSAGE });
        } finally {
          // The submit that triggered this is no longer in flight; the retry is
          // Clerk's to make once the code lands.
          inFlightRef.current = false;
          setBusy(false);
        }
      })();
    },
  });

  const handleSubmit = useCallback(async () => {
    if (inFlightRef.current) return;

    // Only `change` has a current password to supply or validate; in `set` mode
    // there is none by definition.
    if (mode === 'change' && !currentPassword) {
      setErrors({ currentPassword: 'Enter your current password.' });
      return;
    }
    if (!newPassword) {
      setErrors({ newPassword: 'Enter a new password.' });
      return;
    }
    if (!confirmPassword) {
      setErrors({ confirmPassword: 'Re-enter your new password.' });
      return;
    }
    // Checklist §4: equality and new-equals-current are both caught locally, so
    // neither wastes a Clerk attempt against the lockout counter.
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "Those passwords don't match." });
      return;
    }
    if (mode === 'change' && newPassword === currentPassword) {
      setErrors({ newPassword: 'Your new password must be different from your current one.' });
      return;
    }

    // Never report success against a missing Clerk user. The pre-P0 code used
    // `user?.updatePassword(...)`, which resolved to undefined and then showed
    // "Success!" for a change that never happened.
    if (!userLoaded) {
      setErrors({ form: 'Still connecting. Try again in a moment.' });
      return;
    }
    if (!isSignedIn || !user) {
      setErrors({ form: 'Your session has expired. Please sign in again.' });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});

    try {
      await updatePasswordWithReverification(
        mode === 'change' ? { newPassword, currentPassword } : { newPassword }
      );

      // Clear before the card mounts, so Pip's animation never gates the
      // security-relevant step (§3).
      clearSensitiveState();
      setOverlay({
        kind: 'success',
        message:
          mode === 'set'
            ? 'You can now sign in with your email and password too.'
            : "You're signed out everywhere else.",
      });
    } catch (error: unknown) {
      // The user backed out of reverification. That is a choice, not a fault, so
      // it gets no error banner — handleCancelVerification has already returned
      // them to the right step.
      if (cancelledReverificationRef.current) {
        cancelledReverificationRef.current = false;
        return;
      }

      const info = readClerkError(error);

      // Values are deliberately preserved so a rejection costs nothing.
      if (isTransportFailure(info)) {
        setErrors({ form: TRANSPORT_MESSAGE });
      } else if (info.code && CURRENT_PASSWORD_ERROR_CODES.has(info.code)) {
        setErrors({ currentPassword: "That password doesn't match your account. Try again, or reset it below." });
      } else if (info.code === 'user_locked') {
        setOverlay({ kind: 'lockout', message: describeLockout(info.lockoutSeconds) });
      } else if (info.code === 'account_lockout_warning') {
        setErrors({ form: info.message || 'Too many attempts. Your account will be locked shortly.' });
      } else if (info.code && BREACHED_PASSWORD_CODES.has(info.code)) {
        setErrors({ newPassword: 'This password has appeared in a data breach. Pick something else.' });
      } else if (info.code?.startsWith('form_password')) {
        setErrors({ newPassword: info.message || 'Choose a stronger password.' });
      } else if (info.status !== undefined && info.status >= 500) {
        setErrors({ form: SERVICE_MESSAGE });
      } else {
        // Clerk's own message only. Never surface raw status or response objects.
        setErrors({ form: info.message || 'Could not update password. Please try again.' });
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [
    mode,
    currentPassword,
    newPassword,
    confirmPassword,
    userLoaded,
    isSignedIn,
    user,
    clearSensitiveState,
    updatePasswordWithReverification,
  ]);

  /**
   * CP5's "Verify it's you". Runs the check BEFORE asking for a password, which
   * is the point of that screen: a social-only user should not type a new
   * password only to be interrupted for a code straight afterwards.
   */
  const handleStartVerification = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!session) {
      setErrors({ form: 'Your session has expired. Please sign in again.' });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      const started = await startEmailVerification(session, 'first_factor');
      if (started.kind === 'already_verified') {
        setStep('form');
        return;
      }
      if (started.kind === 'unsupported') {
        setErrors({ form: 'We could not confirm your identity in the app. Please contact support.' });
        return;
      }
      setCode('');
      setVerify({ intent: 'proactive', sentTo: started.sentTo });
      setStep('verify');
    } catch (error: unknown) {
      const info = readClerkError(error);
      setErrors({ form: isTransportFailure(info) ? TRANSPORT_MESSAGE : SERVICE_MESSAGE });
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [session]);

  const handleSubmitCode = useCallback(async () => {
    if (inFlightRef.current) return;

    const trimmed = code.trim();
    if (trimmed.length !== CODE_LENGTH) {
      setErrors({ code: `Enter the ${CODE_LENGTH}-digit code from your email.` });
      return;
    }
    if (!session || !verify) {
      setErrors({ form: 'Your session has expired. Please sign in again.' });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      const result = await attemptEmailVerification(session, trimmed);

      if (result.kind === 'needs_second_factor') {
        setErrors({ form: 'This account needs two-factor verification, which we cannot do here yet.' });
        return;
      }
      if (result.kind === 'rejected') {
        setErrors({ code: 'That code could not be verified. Check it and try again.' });
        return;
      }

      setCode('');
      if (verify.intent === 'reactive') {
        // Clerk's own retry of the interrupted submit. The success overlay is
        // raised by the awaiting handleSubmit when that retry resolves.
        const resume = verify.complete;
        setVerify(null);
        setStep('form');
        resume?.();
        return;
      }
      setVerify(null);
      setStep('form');
    } catch (error: unknown) {
      const info = readClerkError(error);
      if (isTransportFailure(info)) {
        setErrors({ form: TRANSPORT_MESSAGE });
      } else if (info.status !== undefined && info.status >= 500) {
        setErrors({ form: SERVICE_MESSAGE });
      } else {
        setErrors({ code: info.message || 'That code could not be verified. Check it and try again.' });
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [code, session, verify]);

  const handleCancelVerification = useCallback(() => {
    if (verify?.intent === 'reactive' && verify.cancel) {
      cancelledReverificationRef.current = true;
      verify.cancel();
    }
    setCode('');
    setVerify(null);
    setErrors({});
    setStep(mode === 'set' ? 'intro' : 'form');
  }, [verify, mode]);

  /**
   * CP18/CP19. Recovery runs from the signed-out sign-in screen, so it cannot be
   * reached from here without signing out first. Nothing is destroyed until the
   * user confirms, and the card says so in plain words.
   */
  const confirmHandoff = useCallback(async () => {
    const recoveryEmail = user?.primaryEmailAddress?.emailAddress ?? '';
    // Order matters: sensitive values go BEFORE the sign-out call, so an error
    // or a slow network can never leave a typed password sitting in state on a
    // screen that is on its way out.
    clearSensitiveState();
    setOverlay(null);

    // Marked BEFORE signOut. The instant `isSignedIn` flips, (tabs)/_layout
    // renders its own <Redirect> to sign-in, which can beat the replace below —
    // the flag is what makes sign-in forward here regardless of who wins.
    startRecoveryHandoff(recoveryEmail);

    try {
      await signOut();
    } catch {
      // Still signed in, so nothing has been handed off. Clear the flag or the
      // next visit to sign-in would bounce into recovery for no reason.
      clearRecoveryEmail();
      setErrors({ form: 'Could not sign you out just now. Check your connection and try again.' });
      return;
    }
    // Fast path: usually lands before the layout redirect and avoids a flash of
    // the sign-in screen. The flag covers the case where it does not.
    router.replace('/(auth)/reset-password');
  }, [user, clearSensitiveState, signOut, router]);

  const handleOverlayAction = useCallback(() => {
    if (!overlay) return;
    if (overlay.kind === 'handoff') {
      void confirmHandoff();
      return;
    }
    // lockout: acknowledge. success: dismiss early and leave.
    setOverlay(null);
    if (overlay.kind === 'success') router.back();
  }, [overlay, confirmHandoff, router]);

  const OVERLAY_TITLE: Record<OverlayKind, string> = {
    success: mode === 'set' ? 'Password added' : 'Password updated',
    lockout: 'Too many attempts',
    handoff: "We'll sign you out",
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
        <TouchableOpacity
          onPress={() => {
            // Leaving mid-verification without cancelling would abandon the
            // interrupted submit's promise still pending inside Clerk.
            if (step === 'verify') {
              handleCancelVerification();
              return;
            }
            router.back();
          }}
          disabled={busy}
          className="mr-4"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        {/* `mode` derives from `passwordEnabled`, which is false while the user
            resource loads — titling on it directly would flash "Set Password"
            at every user before settling. */}
        <Text className="text-xl font-bold flex-1">
          {step === null ? 'Password' : mode === 'set' ? 'Set Password' : 'Change Password'}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView className="flex-1 px-5 pt-6" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {step === null && (
            <View className="items-center justify-center py-16">
              <ActivityIndicator color="#007BFF" />
            </View>
          )}

          {/* CP5. `confident`, not `care`: adding a password is an upgrade, so
              Pip flexes rather than consoles. Inline on the page rather than in
              an overlay — this is the screen's content, not a verdict on it. */}
          {step === 'intro' && (
            <View className="flex-1">
              <View className="items-center px-2 pt-6 pb-8">
                <View
                  className="items-end justify-end mb-2"
                  style={{ height: 96 }}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <PipBird size={96} state="confident" />
                </View>
                <Text className="text-xl font-bold text-textPrimary mb-2">Add a password</Text>
                <Text className="text-textSecondary text-center">
                  You signed up with {describeProvider(user?.externalAccounts?.[0]?.provider)}, so there&apos;s no
                  password on this account yet. Adding one gives you a second way in.
                </Text>
              </View>

              {!!errors.form && <Text className="text-error text-xs mb-3 text-center">{errors.form}</Text>}

              <TouchableOpacity
                onPress={handleStartVerification}
                disabled={busy}
                className={`py-3 rounded-xl items-center ${busy ? 'bg-primary/60' : 'bg-primary'}`}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="font-bold text-white">Verify it&apos;s you</Text>
                )}
              </TouchableOpacity>
              <Text className="text-xs text-textSecondary text-center mt-2">
                We&apos;ll confirm your identity first.
              </Text>
            </View>
          )}

          {/* Shared by both reverification intents. No Pip: this is a
              verification step, not reassurance or a verdict (§3). */}
          {step === 'verify' && (
            <View className="flex-1">
              <Text className="text-textSecondary mb-6">
                Enter the {CODE_LENGTH}-digit code we sent to{' '}
                <Text className="font-bold">{verify?.sentTo}</Text> to confirm it&apos;s you.
              </Text>

              <View
                className={`flex-row items-center bg-gray-50 border rounded-xl px-4 py-1 ${
                  errors.code ? 'border-error' : 'border-gray-200'
                }`}
              >
                <TextInput
                  className="flex-1 py-3 text-base"
                  placeholder={`${CODE_LENGTH}-digit code`}
                  placeholderTextColor="#9CA3AF"
                  value={code}
                  onChangeText={(text) => {
                    setCode(text);
                    clearError('code');
                  }}
                  keyboardType="numeric"
                  maxLength={CODE_LENGTH}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitCode}
                />
              </View>
              {!!errors.code && <Text className="text-error text-xs mt-1">{errors.code}</Text>}
              {!!errors.form && <Text className="text-error text-xs mt-3">{errors.form}</Text>}

              <TouchableOpacity
                onPress={handleSubmitCode}
                disabled={busy}
                className={`py-3 rounded-xl items-center mt-6 ${busy ? 'bg-primary/60' : 'bg-primary'}`}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">Confirm</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCancelVerification}
                disabled={busy}
                className="py-3 items-center mt-2"
                accessibilityRole="button"
              >
                <Text className="font-bold text-gray-500">Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'form' && (
            <>
          {mode === 'change' && (
          <PasswordField
            label="Current password"
            placeholder="Your current password"
            value={currentPassword}
            onChangeText={(text) => {
              setCurrentPassword(text);
              clearError('currentPassword');
            }}
            error={errors.currentPassword}
            visible={showCurrent}
            onToggleVisible={() => setShowCurrent((v) => !v)}
            textContentType="password"
            returnKeyType="next"
          />
          )}

          <PasswordField
            label="New password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(text);
              clearError('newPassword');
            }}
            error={errors.newPassword}
            visible={showNew}
            onToggleVisible={() => setShowNew((v) => !v)}
            textContentType="newPassword"
            returnKeyType="next"
          />

          <PasswordField
            label="Confirm new password"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              clearError('confirmPassword');
            }}
            error={errors.confirmPassword}
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm((v) => !v)}
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <Text className="text-xs text-textSecondary mb-3">
            Signing in on your other devices will be required after this change.
          </Text>

          {/* Permanent, not unlocked after three failures (CP9/CP10). Someone who
              knows they have forgotten their password should not have to prove
              it three times to be offered the way out. Meaningless in `set` mode:
              there is no current password to have forgotten. */}
          {mode === 'change' && (
          <TouchableOpacity
            onPress={() =>
              setOverlay({
                kind: 'handoff',
                message:
                  'Resetting by email happens from the sign-in screen, so we need to sign you out of this device first. Your data stays exactly where it is.',
              })
            }
            disabled={busy}
            className="mb-4"
            accessibilityRole="button"
          >
            <Text className="text-primary font-semibold text-sm">Forgot current password?</Text>
          </TouchableOpacity>
          )}

          {!!errors.form && <Text className="text-error text-xs mb-3">{errors.form}</Text>}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy}
            className={`py-3 rounded-xl items-center ${busy ? 'bg-primary/60' : 'bg-primary'}`}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-bold text-white">{mode === 'set' ? 'Set password' : 'Update password'}</Text>
            )}
          </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* This screen is opaque, so the card keeps its own backdrop. Lockout and
          handoff persist; success auto-dismisses after Pip's full one-shot. */}
      <InlineStatusOverlay
        visible={!!overlay}
        variant={overlay?.kind === 'lockout' ? 'error' : 'success'}
        title={overlay ? OVERLAY_TITLE[overlay.kind] : ''}
        message={overlay?.message ?? ''}
        pip={overlay?.kind === 'success' ? 'happy' : 'care'}
        pipSize={76}
        wide
        autoDismissMs={overlay?.kind === 'success' ? 2000 : null}
        primaryActionLabel={
          overlay?.kind === 'lockout' ? 'Got it' : overlay?.kind === 'handoff' ? 'Sign out' : undefined
        }
        onPrimaryAction={overlay?.kind === 'success' ? undefined : handleOverlayAction}
        secondaryActionLabel={overlay?.kind === 'handoff' ? 'Cancel' : undefined}
        onSecondaryAction={overlay?.kind === 'handoff' ? () => setOverlay(null) : undefined}
        onHide={() => {
          // Only the success card reaches here (the others have no timer).
          setOverlay(null);
          router.back();
        }}
      />
    </SafeAreaView>
  );
};

export default ChangePasswordScreen;
