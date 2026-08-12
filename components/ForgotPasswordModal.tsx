/**
 * FORGOT PASSWORD MODAL
 *
 * Three-step account recovery: request a code, verify the code on its own, then
 * choose a new password. Owns all presentation; the caller (sign-in.tsx) owns
 * Clerk. The code and password steps are deliberately separate screens — see
 * checklist §5, "Verify the code BEFORE showing the new-password form", and
 * mockup FP40, which shows the password step with no code field on it.
 *
 * ERRORS AND OVERLAYS: every error renders inline inside this Modal, and every
 * outcome card renders as an in-modal overlay View — never a second <Modal>.
 * Two top-level Modals do not reliably stack on iOS: the second is silently
 * dropped (ERROR_LOG Error 019) or freezes the screen (Error 055). The previous
 * version called back into sign-in.tsx to open a CustomAlert while this Modal
 * was still presented, which is exactly that bug.
 *
 * PIP: appears only on reassurance and success cards, never on a credential
 * rejection. A wrong or expired code gets plain inline text with no bird — see
 * the password redesign checklist §3.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import TextInputArea from './TextInput';
import InlineStatusOverlay from './InlineStatusOverlay';

/** Which input a provider error belongs beside. `form` is the whole step. */
export type RecoveryField = 'email' | 'code' | 'newPassword' | 'confirmPassword' | 'form';

/**
 * Single string discriminant rather than an `ok: boolean` pair. This project
 * does not enable `strictNullChecks` (Expo's tsconfig.base leaves `strict` off),
 * and without it TypeScript cannot narrow a union on a boolean discriminant —
 * every access to `.kind` on the failure members fails to compile. String
 * literal discriminants narrow correctly either way.
 *
 * `session_cleanup` means the password WAS reset but signing out the
 * recovery-created session failed. Never retry the password on it, only the
 * cleanup.
 *
 * `restart` means the verified attempt has lapsed. The code is spent, so the
 * only way forward is a fresh one — checklist §5 is explicit that this must not
 * drop the user back on the code step holding a dead code.
 */
export type RecoveryActionResult =
  | { kind: 'ok' }
  | { kind: 'field'; field: RecoveryField; message: string }
  | { kind: 'lockout'; message: string }
  | { kind: 'session_cleanup'; message: string }
  | { kind: 'restart'; message: string };

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  /** Prefills the email, e.g. when sign-in returned `needs_new_password`. */
  initialEmail?: string;
  onRequestCode: (email: string) => Promise<RecoveryActionResult>;
  /** Verifies the code alone. Resolves `ok` once Clerk is at `needs_new_password`. */
  onVerifyCode: (code: string) => Promise<RecoveryActionResult>;
  /** Spends the verified attempt on the new password. */
  onSetPassword: (newPassword: string) => Promise<RecoveryActionResult>;
}

type Step = 'email' | 'code' | 'password';

type OverlayKind = 'code-sent' | 'lockout' | 'success' | 'cleanup';

type OverlayState = { kind: OverlayKind; message: string };

type FieldErrors = Partial<Record<RecoveryField, string>>;

/**
 * Deliberately permissive. Clerk is the authority on whether an address exists;
 * this only catches the obviously-unsendable so we don't burn a request.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_LENGTH = 6;

const OVERLAY_COPY: Record<OverlayKind, { title: string; action: string }> = {
  'code-sent': { title: 'Check your email', action: 'Enter code' },
  lockout: { title: 'Too many attempts', action: 'Got it' },
  success: { title: 'Password reset', action: 'Back to sign in' },
  cleanup: { title: 'Password reset', action: 'Retry' },
};

const STEP_COPY: Record<Step, { title: string; submit: string; busy: string }> = {
  email: { title: 'Reset Password', submit: 'Send Code', busy: 'Sending...' },
  code: { title: 'Enter Code', submit: 'Continue', busy: 'Checking...' },
  password: { title: 'New Password', submit: 'Update', busy: 'Saving...' },
};

const ForgotPasswordModal = ({
  visible,
  onClose,
  initialEmail,
  onRequestCode,
  onVerifyCode,
  onSetPassword,
}: ForgotPasswordModalProps) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Synchronous double-tap guard. `busy` drives the disabled state but React
   * batches it, so two taps in the same frame both pass the check — this ref
   * flips before any await and is what actually blocks the second request.
   */
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    // Seed from initialEmail rather than '' — otherwise the needs_new_password
    // prefill is wiped the moment the modal opens.
    setEmail(initialEmail ?? '');
    setStep('email');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
    setOverlay(null);
    setBusy(false);
    inFlightRef.current = false;
  }, [visible, initialEmail]);

  /** Clearing only the edited field keeps other errors visible while fixing one. */
  const clearError = useCallback((field: RecoveryField) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  /** The spent-code path: back to the top with the reason still on screen. */
  const restartFromEmail = useCallback((message: string) => {
    setStep('email');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({ form: message });
  }, []);

  const applyResult = useCallback(
    (result: RecoveryActionResult, onSuccess: () => void) => {
      if (result.kind === 'ok') {
        onSuccess();
        return;
      }
      if (result.kind === 'field') {
        setErrors({ [result.field]: result.message });
        return;
      }
      if (result.kind === 'lockout') {
        setOverlay({ kind: 'lockout', message: result.message });
        return;
      }
      if (result.kind === 'restart') {
        restartFromEmail(result.message);
        return;
      }
      setOverlay({ kind: 'cleanup', message: result.message });
    },
    [restartFromEmail]
  );

  const handleSendCode = useCallback(async () => {
    if (inFlightRef.current) return;

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(normalized)) {
      setErrors({ email: "That doesn't look like an email address yet." });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      const result = await onRequestCode(normalized);
      // Keep the normalized value so the code step and copy agree with what
      // was actually sent to Clerk.
      setEmail(normalized);
      applyResult(result, () =>
        setOverlay({
          kind: 'code-sent',
          message: `If an account exists for ${normalized}, a ${CODE_LENGTH}-digit code is on its way.`,
        })
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [email, onRequestCode, applyResult]);

  const handleSubmitCode = useCallback(async () => {
    if (inFlightRef.current) return;

    const trimmed = code.trim();
    if (trimmed.length !== CODE_LENGTH) {
      setErrors({ code: `Enter the ${CODE_LENGTH}-digit code from your email.` });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      const result = await onVerifyCode(trimmed);
      // No overlay here: a verified code is a step, not an outcome. Pip is for
      // reassurance and terminals only (§3), so this just advances.
      applyResult(result, () => setStep('password'));
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [code, onVerifyCode, applyResult]);

  const handleSubmitPassword = useCallback(async () => {
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

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      // Values are deliberately left in place on rejection: a weak-password
      // retry must not cost the user their code.
      const result = await onSetPassword(newPassword);
      applyResult(result, () =>
        setOverlay({
          kind: 'success',
          message: 'Sign in with your new password to pick up where you left off.',
        })
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [newPassword, confirmPassword, onSetPassword, applyResult]);

  const submitCurrentStep = useCallback(() => {
    if (step === 'email') return void handleSendCode();
    if (step === 'code') return void handleSubmitCode();
    return void handleSubmitPassword();
  }, [step, handleSendCode, handleSubmitCode, handleSubmitPassword]);

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
        onClose();
        return;
      case 'cleanup':
        // Retries cleanup only. sign-in.tsx branches on the Clerk status, sees
        // `complete`, and re-runs the signOut without touching the password.
        setOverlay(null);
        void handleSubmitPassword();
        return;
    }
  }, [overlay, onClose, handleSubmitPassword]);

  const copy = STEP_COPY[step];

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      {/* Full-screen root. Overlays mount as its final child so they cover the
          whole sheet rather than sitting inside the white card. */}
      <View className="flex-1 justify-center bg-black/50 px-6">
        <View className="bg-white p-6 rounded-3xl shadow-xl">
          <Text className="text-2xl font-bold mb-2 text-center text-textPrimary">{copy.title}</Text>

          {step === 'email' && (
            <>
              <Text className="text-textSecondary mb-6 text-center">
                Enter your email address below to receive a password reset code.
              </Text>

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
              <Text className="text-textSecondary mb-6 text-center">
                Enter the {CODE_LENGTH}-digit code sent to{' '}
                <Text className="font-bold">{email}</Text>.
              </Text>

              <TextInputArea
                placeholder={`${CODE_LENGTH}-digit code`}
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
              {!!errors.code && <Text className="text-error text-xs -mt-2 mb-3">{errors.code}</Text>}
            </>
          )}

          {step === 'password' && (
            <>
              <Text className="text-textSecondary mb-6 text-center">
                Choose a new password for <Text className="font-bold">{email}</Text>.
              </Text>

              <TextInputArea
                placeholder="New password"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  clearError('newPassword');
                }}
                secureTextEntry={true}
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
                secureTextEntry={true}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSubmitPassword}
              />
              {!!errors.confirmPassword && (
                <Text className="text-error text-xs -mt-2 mb-3">{errors.confirmPassword}</Text>
              )}
            </>
          )}

          {!!errors.form && <Text className="text-error text-xs mb-3 text-center">{errors.form}</Text>}

          <View className="flex-row justify-between mt-4 gap-4">
            <TouchableOpacity
              onPress={onClose}
              disabled={busy}
              className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
            >
              <Text className="font-bold text-gray-600">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submitCurrentStep}
              disabled={busy}
              className={`flex-1 py-3 rounded-xl items-center ${busy ? 'bg-primary/60' : 'bg-primary'}`}
            >
              <Text className="font-bold text-white">{busy ? copy.busy : copy.submit}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Persistent by design: these cards carry the only way forward, so an
            auto-dismiss would strand the user mid-recovery. */}
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
      </View>
    </Modal>
  );
};

export default ForgotPasswordModal;
