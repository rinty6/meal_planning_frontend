/**
 * FORGOT PASSWORD MODAL
 *
 * Two-step account recovery: request a code, then verify it and set a new
 * password. Owns all presentation; the caller (sign-in.tsx) owns Clerk.
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
export type RecoveryField = 'email' | 'code' | 'newPassword' | 'form';

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
 */
export type RecoveryActionResult =
  | { kind: 'ok' }
  | { kind: 'field'; field: RecoveryField; message: string }
  | { kind: 'lockout'; message: string }
  | { kind: 'session_cleanup'; message: string };

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  /** Prefills the email, e.g. when sign-in returned `needs_new_password`. */
  initialEmail?: string;
  onRequestCode: (email: string) => Promise<RecoveryActionResult>;
  onVerify: (code: string, newPassword: string) => Promise<RecoveryActionResult>;
}

type Step = 'email' | 'code';

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

const ForgotPasswordModal = ({
  visible,
  onClose,
  initialEmail,
  onRequestCode,
  onVerify,
}: ForgotPasswordModalProps) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
    setErrors({});
    setOverlay(null);
    setBusy(false);
    inFlightRef.current = false;
  }, [visible, initialEmail]);

  /** Clearing only the edited field keeps other errors visible while fixing one. */
  const clearError = useCallback((field: RecoveryField) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
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
      setOverlay({ kind: 'cleanup', message: result.message });
    },
    []
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

  const handleUpdate = useCallback(async () => {
    if (inFlightRef.current) return;

    if (code.trim().length !== CODE_LENGTH) {
      setErrors({ code: `Enter the ${CODE_LENGTH}-digit code from your email.` });
      return;
    }
    if (!newPassword) {
      setErrors({ newPassword: 'Enter a new password.' });
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    setErrors({});
    try {
      // Values are deliberately left in place on rejection: a weak-password
      // retry must not cost the user their code.
      const result = await onVerify(code.trim(), newPassword);
      applyResult(result, () =>
        setOverlay({
          kind: 'success',
          message: 'You can now sign in with your new password.',
        })
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [code, newPassword, onVerify, applyResult]);

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
        void handleUpdate();
        return;
    }
  }, [overlay, onClose, handleUpdate]);

  const isCodeStep = step === 'code';

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      {/* Full-screen root. Overlays mount as its final child so they cover the
          whole sheet rather than sitting inside the white card. */}
      <View className="flex-1 justify-center bg-black/50 px-6">
        <View className="bg-white p-6 rounded-3xl shadow-xl">
          <Text className="text-2xl font-bold mb-2 text-center text-textPrimary">Reset Password</Text>

          {!isCodeStep ? (
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
          ) : (
            <>
              <Text className="text-textSecondary mb-6 text-center">
                Enter the {CODE_LENGTH}-digit code sent to{' '}
                <Text className="font-bold">{email}</Text> and choose a new password.
              </Text>

              <TextInputArea
                placeholder="6-digit code"
                value={code}
                onChangeText={(text) => {
                  setCode(text);
                  clearError('code');
                }}
                keyboardType="numeric"
                maxLength={CODE_LENGTH}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="next"
              />
              {!!errors.code && <Text className="text-error text-xs -mt-2 mb-3">{errors.code}</Text>}

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
                returnKeyType="done"
                onSubmitEditing={handleUpdate}
              />
              {!!errors.newPassword && (
                <Text className="text-error text-xs -mt-2 mb-3">{errors.newPassword}</Text>
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
              onPress={isCodeStep ? handleUpdate : handleSendCode}
              disabled={busy}
              className={`flex-1 py-3 rounded-xl items-center ${busy ? 'bg-primary/60' : 'bg-primary'}`}
            >
              <Text className="font-bold text-white">
                {busy ? (isCodeStep ? 'Saving...' : 'Sending...') : isCodeStep ? 'Update' : 'Send Code'}
              </Text>
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
