/**
 * RESET PASSWORD — dedicated recovery route (P1).
 *
 * Replaces `ForgotPasswordModal`. P0 ran recovery as a Modal opened from
 * sign-in, with sign-in owning Clerk and the modal owning presentation. That
 * split existed to keep P0 inside five files; it is gone now. This route owns
 * both, which is what lets the three steps be real steps with their own header,
 * their own back behaviour, and no risk of a second Modal stacking over a first
 * (ERROR_LOG Error 019).
 *
 * STEPS: email → code → password. The code is verified on its own
 * (`attemptFirstFactor` with no `password`), which Clerk answers with
 * `needs_new_password`; only then is the password form shown. Checklist §5.
 *
 * PIP: reassurance and terminals only. Code-sent and lockout get `care`, the
 * success terminal gets `happy`, and every credential rejection — wrong code,
 * expired code, weak password — gets plain inline text with no bird (§3).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSignIn, useClerk } from '@clerk/clerk-expo';
import TextInputArea from '../../components/TextInput';
import InlineStatusOverlay from '../../components/InlineStatusOverlay';
import { takeRecoveryEmail } from '../../utils/recoveryHandoff';
import {
  readClerkError,
  isTransportFailure,
  isThrottled,
  describeLockout,
  BREACHED_PASSWORD_CODES,
  TRANSPORT_MESSAGE,
  SERVICE_MESSAGE,
  NOT_READY_MESSAGE,
  MFA_MESSAGE,
} from '../../utils/clerkErrors';

type Step = 'email' | 'code' | 'password';

type FieldKey = 'email' | 'code' | 'newPassword' | 'confirmPassword' | 'form';

type FieldErrors = Partial<Record<FieldKey, string>>;

type OverlayKind = 'code-sent' | 'lockout' | 'success' | 'cleanup';

type OverlayState = { kind: OverlayKind; message: string };

/**
 * Deliberately permissive. Clerk is the authority on whether an address exists;
 * this only catches the obviously-unsendable so we don't burn a request.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_LENGTH = 6;

/**
 * UI-side resend cooldown. Clerk's own rate limiting stays authoritative — this
 * exists so the user sees *why* Resend is unavailable instead of tapping it into
 * a 429 (§5, "keep provider-side rate limiting authoritative; add a resend
 * cooldown in the UI").
 */
const RESEND_COOLDOWN_SECONDS = 45;

const STEP_META: Record<Step, { title: string; hint: (email: string) => string }> = {
  email: {
    title: 'Reset Password',
    hint: () => "Enter the email you signed up with and we'll send you a 6-digit code.",
  },
  code: {
    title: 'Enter Code',
    hint: (email) => `We sent a ${CODE_LENGTH}-digit code to ${email}.`,
  },
  password: {
    title: 'New Password',
    hint: (email) => `Code accepted. Choose a new password for ${email}.`,
  },
};

const OVERLAY_COPY: Record<OverlayKind, { title: string; action: string }> = {
  'code-sent': { title: 'Check your email', action: 'Enter code' },
  lockout: { title: 'Too many attempts', action: 'Got it' },
  success: { title: 'Password reset', action: 'Back to sign in' },
  cleanup: { title: 'Password reset', action: 'Retry' },
};

/**
 * One source for the code-sent copy. It is rendered on both the success and the
 * neutral-4xx path, and enumeration protection depends on those two being
 * character-for-character identical — two string literals would eventually drift.
 * Taking no argument makes that identity structural rather than a convention.
 *
 * "If an account exists" stays. Without it the card asserts a code was sent,
 * which is false for an unregistered or passwordless address, and someone who
 * mistyped their email would sit waiting for mail that is never coming. The
 * address itself is dropped because the email field sits directly above this
 * card and still shows it — that was the redundant part, not the hedge.
 *
 * KNOWN GAP (checklist §9.2, F2): a social-only account has no password
 * credential, so its request also lands here and the user waits for a code
 * that can never arrive. A generic social-login line was added and then
 * removed by product decision (2026-08-12) — deliberately dropped, not an
 * oversight. If this resurfaces, that line is the fix; it must stay identical
 * across every address to avoid re-opening the enumeration leak it was built
 * to close.
 */
const CODE_SENT_MESSAGE = `If an account exists, a ${CODE_LENGTH}-digit code is on its way.`;

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const ResetPasswordScreen = () => {
  const router = useRouter();
  const { signIn, isLoaded } = useSignIn();
  const { signOut } = useClerk();

  const [step, setStep] = useState<Step>('email');
  // Read-once handoff from sign-in; empty when recovery was started cold.
  const [email, setEmail] = useState(() => takeRecoveryEmail());
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /**
   * Set when Clerk rejects the code. Promotes Resend to the primary action and
   * demotes Verify, because the code is single-use — leaving Verify primary
   * invites the user to resubmit something already known to be dead (FP23).
   */
  const [codeRejected, setCodeRejected] = useState(false);

  /**
   * Synchronous double-tap guard. `busy` drives the disabled state but React
   * batches it, so two taps in the same frame both pass the check — this ref
   * flips before any await and is what actually blocks the second request.
   */
  const inFlightRef = useRef(false);

  /**
   * Keyed on "is the countdown running", not on the value — depending on
   * `cooldown` itself would tear down and rebuild the interval on every tick.
   */
  const cooldownRunning = cooldown > 0;
  useEffect(() => {
    if (!cooldownRunning) return;
    const id = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownRunning]);

  /** Clearing only the edited field keeps other errors visible while fixing one. */
  const clearError = useCallback((field: FieldKey) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  /** Back to a clean email step. Used by Change email and by the spent-code path. */
  const restartFromEmail = useCallback((message?: string) => {
    setStep('email');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setCodeRejected(false);
    setCooldown(0);
    setErrors(message ? { form: message } : {});
  }, []);

  /**
   * Signs out the session `resetPassword` created. It is never activated, so it
   * is invisible in-flow — but Clerk's initial-session selector picks it up on
   * the next app launch and would silently sign the user in.
   */
  const cleanupRecoverySession = useCallback(
    async (createdSessionId?: string | null): Promise<boolean> => {
      const sessionId = createdSessionId ?? signIn?.createdSessionId;
      if (!sessionId) return true;
      try {
        await signOut({ sessionId });
        return true;
      } catch {
        return false;
      }
    },
    [signIn, signOut]
  );

  /**
   * Retries ONLY the sign-out. The password is already reset at this point and
   * the entered values have been cleared, so routing this back through
   * `handleSetPassword` would trip its empty-field guard and, worse, imply the
   * password change had not happened. Checklist: "never retry the password on
   * [session_cleanup], only the cleanup".
   */
  const handleRetryCleanup = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const cleaned = await cleanupRecoverySession();
      setOverlay(
        cleaned
          ? {
              kind: 'success',
              message: 'Sign in with your new password to pick up where you left off.',
            }
          : {
              kind: 'cleanup',
              message: 'Your password was reset. We could not finish signing this device out.',
            }
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [cleanupRecoverySession]);

  // ---------------------------------------------------------------- step 1

  const sendCode = useCallback(
    async (targetEmail: string, { isResend }: { isResend: boolean }) => {
      if (inFlightRef.current) return;
      if (!isLoaded || !signIn) {
        setErrors({ form: NOT_READY_MESSAGE });
        return;
      }

      inFlightRef.current = true;
      setBusy(true);
      setErrors({});
      try {
        await signIn.create({ strategy: 'reset_password_email_code', identifier: targetEmail });

        setCooldown(RESEND_COOLDOWN_SECONDS);
        setCodeRejected(false);
        setCode('');

        if (isResend) {
          // Already on the code step; a full card here would be a wall between
          // the user and the field they are trying to fill.
          setStep('code');
        } else {
          setOverlay({
            kind: 'code-sent',
            message: CODE_SENT_MESSAGE,
          });
        }
      } catch (error: unknown) {
        const info = readClerkError(error);

        if (isTransportFailure(info)) {
          setErrors({ form: TRANSPORT_MESSAGE });
        } else if (isThrottled(info)) {
          setOverlay({ kind: 'lockout', message: describeLockout(info.lockoutSeconds) });
        } else if (info.status !== undefined && info.status >= 500) {
          setErrors({ form: SERVICE_MESSAGE });
        } else {
          // Remaining 4xx are account-existence / capability facts. Staying
          // neutral is the whole enumeration defence: an unregistered address
          // and a social-only one must be indistinguishable from a real one.
          setCooldown(RESEND_COOLDOWN_SECONDS);
          setCodeRejected(false);
          setCode('');
          if (isResend) {
            setStep('code');
          } else {
            setOverlay({
              kind: 'code-sent',
              message: CODE_SENT_MESSAGE,
            });
          }
        }
      } finally {
        inFlightRef.current = false;
        setBusy(false);
      }
    },
    [isLoaded, signIn]
  );

  const handleSendCode = useCallback(() => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(normalized)) {
      setErrors({ email: "That doesn't look like an email address yet." });
      return;
    }
    // Keep the normalized value so every later screen and message agrees with
    // what was actually sent to Clerk.
    setEmail(normalized);
    void sendCode(normalized, { isResend: false });
  }, [email, sendCode]);

  const handleResend = useCallback(() => {
    if (cooldown > 0) return;
    void sendCode(email, { isResend: true });
  }, [cooldown, email, sendCode]);

  // ---------------------------------------------------------------- step 2

  const handleVerifyCode = useCallback(async () => {
    if (inFlightRef.current) return;

    const trimmed = code.trim();
    if (trimmed.length !== CODE_LENGTH) {
      setErrors({ code: `Enter the ${CODE_LENGTH}-digit code from your email.` });
      return;
    }
    if (!isLoaded || !signIn) {
      setErrors({ form: NOT_READY_MESSAGE });
      return;
    }

    // Already verified — the user backed up to this screen. Resubmitting a spent
    // code would fail for the wrong reason and strand them on a cleared step.
    if (signIn.status === 'needs_new_password') {
      setStep('password');
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      const verified = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: trimmed,
      });

      if (verified.status === 'needs_second_factor') {
        setErrors({ form: MFA_MESSAGE });
        return;
      }
      if (verified.status !== 'needs_new_password') {
        setCodeRejected(true);
        setErrors({ code: 'That code could not be verified. Send a new one to try again.' });
        return;
      }
      setStep('password');
    } catch (error: unknown) {
      const info = readClerkError(error);

      if (isTransportFailure(info)) {
        setErrors({ form: TRANSPORT_MESSAGE });
      } else if (isThrottled(info)) {
        setOverlay({ kind: 'lockout', message: describeLockout(info.lockoutSeconds) });
      } else if (info.status !== undefined && info.status >= 500) {
        setErrors({ form: SERVICE_MESSAGE });
      } else {
        // Everything else at this step is a verdict on the code itself.
        setCodeRejected(true);
        setErrors({ code: info.message || 'That code has expired. Send a new one to try again.' });
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [code, isLoaded, signIn]);

  // ---------------------------------------------------------------- step 3

  const handleSetPassword = useCallback(async () => {
    if (inFlightRef.current) return;

    if (!newPassword) {
      setErrors({ newPassword: 'Enter a new password.' });
      return;
    }
    if (!confirmPassword) {
      setErrors({ confirmPassword: 'Re-enter your new password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "Those passwords don't match." });
      return;
    }
    if (!isLoaded || !signIn) {
      setErrors({ form: NOT_READY_MESSAGE });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      let status = signIn.status;
      let createdSessionId: string | null | undefined;

      if (status === 'needs_new_password') {
        // Values are deliberately left in place on rejection: a weak-password
        // retry must not cost the user their code.
        const reset = await signIn.resetPassword({
          password: newPassword,
          signOutOfOtherSessions: true,
        });
        status = reset.status;
        createdSessionId = reset.createdSessionId;

        if (status === 'needs_second_factor') {
          setErrors({ form: MFA_MESSAGE });
          return;
        }
      }

      if (status === 'complete') {
        // Clear sensitive values BEFORE the card mounts, so Pip's animation
        // never gates the security-relevant step (§3).
        setNewPassword('');
        setConfirmPassword('');
        setCode('');

        const cleaned = await cleanupRecoverySession(createdSessionId);
        setOverlay(
          cleaned
            ? {
                kind: 'success',
                message: 'Sign in with your new password to pick up where you left off.',
              }
            : {
                kind: 'cleanup',
                message: 'Your password was reset. We could not finish signing this device out.',
              }
        );
        return;
      }

      // The attempt is no longer verified. The code is spent, so a fresh one is
      // the only way forward — never send them back to a dead code screen (§5).
      restartFromEmail('That code has expired. Request a new one to continue.');
    } catch (error: unknown) {
      const info = readClerkError(error);

      if (isTransportFailure(info)) {
        setErrors({ form: TRANSPORT_MESSAGE });
      } else if (isThrottled(info)) {
        setOverlay({ kind: 'lockout', message: describeLockout(info.lockoutSeconds) });
      } else if (info.code && BREACHED_PASSWORD_CODES.has(info.code)) {
        setErrors({ newPassword: 'This password has appeared in a data breach. Pick something else.' });
      } else if (info.code?.startsWith('form_password')) {
        setErrors({ newPassword: info.message || 'Choose a stronger password.' });
      } else if (info.code?.includes('code') || info.code?.includes('verification')) {
        restartFromEmail(info.message || 'That code has expired. Request a new one to continue.');
      } else if (info.status !== undefined && info.status >= 500) {
        setErrors({ form: SERVICE_MESSAGE });
      } else {
        setErrors({ form: info.message || 'Recovery could not be completed. Please start again.' });
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [newPassword, confirmPassword, isLoaded, signIn, cleanupRecoverySession, restartFromEmail]);

  // ---------------------------------------------------------------- chrome

  const leaveRecovery = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/sign-in');
  }, [router]);

  const handleBack = useCallback(() => {
    if (busy) return;
    if (step === 'password') {
      // No route back into a spent code. Leaving is the honest option.
      leaveRecovery();
      return;
    }
    if (step === 'code') {
      restartFromEmail();
      return;
    }
    leaveRecovery();
  }, [busy, step, restartFromEmail, leaveRecovery]);

  const handleOverlayAction = useCallback(() => {
    if (!overlay) return;
    switch (overlay.kind) {
      case 'code-sent':
        setOverlay(null);
        setStep('code');
        return;
      case 'lockout':
        setOverlay(null);
        return;
      case 'success':
        setOverlay(null);
        leaveRecovery();
        return;
      case 'cleanup':
        setOverlay(null);
        void handleRetryCleanup();
        return;
    }
  }, [overlay, leaveRecovery, handleRetryCleanup]);

  const meta = STEP_META[step];
  const submitLabel = step === 'email' ? 'Send code' : step === 'code' ? 'Verify code' : 'Reset password';
  const busyLabel = step === 'email' ? 'Sending...' : step === 'code' ? 'Checking...' : 'Saving...';
  const onSubmit = step === 'email' ? handleSendCode : step === 'code' ? handleVerifyCode : handleSetPassword;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 py-4 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={handleBack} className="mr-4" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text className="text-xl font-bold flex-1 text-[#111827]">{meta.title}</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1 px-6 pt-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-textSecondary mb-6">{meta.hint(email)}</Text>

          {step === 'email' && (
            <>
              <TextInputArea
                placeholder="Email address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  clearError('email');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                returnKeyType="send"
                onSubmitEditing={handleSendCode}
              />
              {!!errors.email && <Text className="text-error text-xs -mt-2 mb-3">{errors.email}</Text>}
            </>
          )}

          {step === 'code' && (
            <>
              <TextInputArea
                placeholder={`${CODE_LENGTH}-digit code`}
                value={code}
                onChangeText={(text) => {
                  setCode(text);
                  setCodeRejected(false);
                  clearError('code');
                }}
                keyboardType="numeric"
                maxLength={CODE_LENGTH}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="done"
                onSubmitEditing={handleVerifyCode}
              />
              {!!errors.code && <Text className="text-error text-xs -mt-2 mb-3">{errors.code}</Text>}

              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs text-textSecondary">
                  {cooldown > 0 ? `Resend available in ${formatCountdown(cooldown)}` : 'You can resend a code now.'}
                </Text>
                <TouchableOpacity onPress={() => restartFromEmail()} disabled={busy} accessibilityRole="button">
                  <Text className="text-xs font-bold text-primary">Change email</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === 'password' && (
            <>
              <TextInputArea
                placeholder="New password"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  clearError('newPassword');
                }}
                secureTextEntry={!showNewPassword}
                isPassword
                isPasswordVisible={showNewPassword}
                onTogglePassword={() => setShowNewPassword((v) => !v)}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="next"
              />
              {!!errors.newPassword && (
                <Text className="text-error text-xs -mt-2 mb-3">{errors.newPassword}</Text>
              )}

              <TextInputArea
                placeholder="Confirm new password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  clearError('confirmPassword');
                }}
                secureTextEntry={!showConfirmPassword}
                isPassword
                isPasswordVisible={showConfirmPassword}
                onTogglePassword={() => setShowConfirmPassword((v) => !v)}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSetPassword}
              />
              {!!errors.confirmPassword && (
                <Text className="text-error text-xs -mt-2 mb-3">{errors.confirmPassword}</Text>
              )}

              <Text className="text-xs text-textSecondary mb-2">
                You&apos;ll be signed out on any other devices.
              </Text>
            </>
          )}

          {!!errors.form && <Text className="text-error text-xs mb-3">{errors.form}</Text>}

          {/* On a rejected code the primary action becomes Resend: the code in
              the field is spent, so offering Verify first invites a retry that
              cannot possibly succeed (FP23). */}
          {/* Resend stands alone here — no Verify button. Editing any digit
              clears `codeRejected` and brings Verify straight back, so a simple
              typo still has a one-keystroke path forward without the UI
              inviting a resubmit of a code Clerk has already refused. */}
          {step === 'code' && codeRejected ? (
            <TouchableOpacity
              onPress={handleResend}
              disabled={busy || cooldown > 0}
              className={`py-3 rounded-xl items-center ${busy || cooldown > 0 ? 'bg-primary/60' : 'bg-primary'}`}
              accessibilityRole="button"
            >
              <Text className="font-bold text-white">
                {busy ? busyLabel : cooldown > 0 ? `Resend in ${formatCountdown(cooldown)}` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={onSubmit}
                disabled={busy}
                className={`py-3 rounded-xl items-center ${busy ? 'bg-primary/60' : 'bg-primary'}`}
                accessibilityRole="button"
              >
                <Text className="font-bold text-white">{busy ? busyLabel : submitLabel}</Text>
              </TouchableOpacity>

              {step === 'code' && (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={busy || cooldown > 0}
                  className="py-3 rounded-xl items-center mt-2 bg-gray-100"
                  accessibilityRole="button"
                >
                  <Text className={`font-bold ${cooldown > 0 ? 'text-gray-400' : 'text-gray-600'}`}>
                    {cooldown > 0 ? `Resend in ${formatCountdown(cooldown)}` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              )}

              {step === 'email' && (
                <TouchableOpacity onPress={leaveRecovery} className="py-3 items-center mt-1" accessibilityRole="button">
                  <Text className="font-bold text-gray-500">Back to sign in</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Persistent by design: these cards carry the only way forward, so an
          auto-dismiss would strand the user mid-recovery. This screen is opaque,
          so the overlay keeps its own backdrop. */}
      <InlineStatusOverlay
        visible={!!overlay}
        variant={overlay?.kind === 'lockout' ? 'error' : 'success'}
        title={overlay ? OVERLAY_COPY[overlay.kind].title : ''}
        message={overlay?.message ?? ''}
        pip={overlay?.kind === 'success' ? 'happy' : 'care'}
        pipSize={76}
        wide
        autoDismissMs={null}
        primaryActionLabel={overlay ? OVERLAY_COPY[overlay.kind].action : undefined}
        onPrimaryAction={handleOverlayAction}
        onHide={() => setOverlay(null)}
      />
    </SafeAreaView>
  );
};

export default ResetPasswordScreen;
