/**
 * CLERK ERROR READING — shared by both password journeys.
 *
 * P0 deliberately kept copies of `readClerkError` and `isTransportFailure` in
 * `sign-in.tsx` and `privacy.tsx` to respect a five-file scope. That duplication
 * is resolved here (checklist §2, "Known duplication for P1").
 *
 * Nothing in this module logs. Clerk error payloads can carry the submitted
 * identifier, so `readClerkError` pulls out only the three fields the UI needs
 * and the caller never sees the raw object — checklist §6, "do not include
 * email/password/code values in diagnostic events".
 */

/**
 * Codes that survive the neutral enumeration bucket in the recovery journey.
 *
 * "Every Clerk 4xx becomes a neutral acknowledgement" would swallow rate limits
 * and cheerfully tell the user a code is on its way when Clerk refused to send
 * one. These are not account-existence facts, so they are allowed through.
 */
const THROTTLE_CODES = new Set([
  'user_locked',
  'action_blocked',
  'user_banned',
  'rate_limit_exceeded',
  'too_many_requests',
  'signup_rate_limit_exceeded',
]);

/**
 * Codes that mean "the CURRENT password you supplied is wrong", as opposed to
 * "the NEW password you chose is unacceptable". Everything else in the
 * `form_password_*` family is a policy rejection and belongs beside New password.
 *
 * `form_password_validation_failed` is the one that matters: Clerk answers
 * `user.updatePassword` with it, not with `form_password_incorrect`. Missing it
 * is what put the wrong-password error under the New password field in device
 * round 1 (checklist §9.1, D1).
 */
export const CURRENT_PASSWORD_ERROR_CODES = new Set([
  'form_password_incorrect',
  'form_password_validation_failed',
  'form_password_or_identifier_incorrect',
]);

/** Clerk's two spellings for "this password is in a breach corpus". */
export const BREACHED_PASSWORD_CODES = new Set(['form_password_pwned', 'form_password_compromised']);

export type ClerkErrorInfo = {
  status?: number;
  code?: string;
  message?: string;
  /** Only Clerk lockout errors carry this, and not on every instance. */
  lockoutSeconds?: number;
};

export const readClerkError = (error: unknown): ClerkErrorInfo => {
  const err = error as {
    status?: unknown;
    errors?: { code?: string; message?: string; longMessage?: string; meta?: Record<string, unknown> }[];
  };
  const first = Array.isArray(err?.errors) ? err.errors[0] : undefined;
  const lockout = first?.meta?.lockoutExpiresInSeconds;
  return {
    status: typeof err?.status === 'number' ? err.status : undefined,
    code: first?.code,
    // longMessage is Clerk's user-facing sentence; message is its short form.
    message: first?.longMessage || first?.message,
    lockoutSeconds: typeof lockout === 'number' ? lockout : undefined,
  };
};

/** No HTTP status and no Clerk error body means the request never landed. */
export const isTransportFailure = (info: ClerkErrorInfo) =>
  info.status === undefined && info.code === undefined;

export const isThrottled = (info: ClerkErrorInfo) =>
  info.status === 429 ||
  (!!info.code && THROTTLE_CODES.has(info.code)) ||
  (!!info.code && info.code.includes('rate_limit'));

/**
 * `lockoutExpiresInSeconds` is documented but not guaranteed on every lockout
 * error, so the no-duration wording has to stand on its own rather than reading
 * as a truncated sentence.
 */
export const describeLockout = (seconds?: number) => {
  if (!seconds || seconds <= 0) {
    return 'For your security, try again shortly. Nothing has changed on your account.';
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `For your security, try again in ${minutes} minute${minutes === 1 ? '' : 's'}. Nothing has changed on your account.`;
};

export const TRANSPORT_MESSAGE = 'Could not reach the server. Check your connection and try again.';
export const SERVICE_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';
export const NOT_READY_MESSAGE = 'Still connecting. Try again in a moment.';

/**
 * MFA during recovery is not handled yet. "Start over" would loop a 2FA user
 * through the same wall forever, so this points somewhere that can actually help.
 */
export const MFA_MESSAGE =
  'This account uses two-factor authentication, which we cannot reset in the app yet. Please contact support.';
