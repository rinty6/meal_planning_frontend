/**
 * SESSION REVERIFICATION — email-code helpers.
 *
 * Clerk's `useReverification` ships a ready-made modal on the web. React Native
 * has no such UI, so `onNeedsReverification` must be supplied and the flow
 * driven by hand. These helpers wrap the three `SessionResource` calls that
 * involve so the screen holds UI state and nothing else.
 *
 * EMAIL CODE ONLY, deliberately. `supportedFirstFactors` can also offer
 * `password` (useless here — reverification exists precisely because the
 * password is missing or unproven), `phone_code` (this app collects no phone
 * numbers) and `passkey` (never registered). Anything other than email is
 * reported as unsupported rather than half-handled.
 *
 * Nothing here logs: Clerk verification payloads carry the email address.
 */

// From `@clerk/shared/types`, a declared export subpath — NOT `@clerk/types`,
// whose `dist/` is empty in this install. The overrides in package.json pin
// `@clerk/shared` to 3.39.0, so this path is stable for this project.
import type { SessionResource, SessionVerificationLevel } from '@clerk/shared/types';

export type VerificationStart =
  /** Session already satisfies the level; no code needed. */
  | { kind: 'already_verified' }
  /** A code is on its way. `sentTo` is Clerk's redacted identifier. */
  | { kind: 'code_sent'; sentTo: string }
  /** No email factor offered — cannot proceed in-app. */
  | { kind: 'unsupported' }
  /**
   * Clerk accepted the request but the resulting verification came back
   * `failed`/`expired` — i.e. no code was actually dispatched. This resolves
   * rather than throwing, so without an explicit check it is indistinguishable
   * from a successful send and strands the user on a code screen waiting for
   * mail that is never coming.
   *
   * NOTE: this does NOT catch the §9.4 case. There Clerk returned a perfectly
   * healthy `unverified` verification with a null error and still sent nothing,
   * so no client-side check could have detected it.
   */
  | { kind: 'send_failed'; message?: string };

export type VerificationAttempt =
  | { kind: 'complete' }
  /** Clerk wants a second factor; out of scope, same as the recovery journey. */
  | { kind: 'needs_second_factor' }
  | { kind: 'rejected' };

/**
 * Starts reverification at `level` and prepares an email code.
 *
 * `startVerification` can come back already `complete` when the session was
 * verified recently enough to satisfy the configured `afterMinutes`. Treating
 * that as "send a code" would email the user for nothing and stall on a code
 * that never arrives.
 */
export const startEmailVerification = async (
  session: SessionResource,
  level: SessionVerificationLevel
): Promise<VerificationStart> => {
  const verification = await session.startVerification({ level });

  if (verification.status === 'complete') return { kind: 'already_verified' };

  const emailFactor = verification.supportedFirstFactors?.find(
    (factor): factor is Extract<typeof factor, { strategy: 'email_code' }> =>
      factor.strategy === 'email_code'
  );
  if (!emailFactor) return { kind: 'unsupported' };

  const prepared = await session.prepareFirstFactorVerification({
    strategy: 'email_code',
    emailAddressId: emailFactor.emailAddressId,
  });

  // A resolved promise is NOT proof that a code went out. Clerk reports a
  // dispatch failure on the returned resource rather than by throwing, so
  // ignoring it turns "we never sent anything" into a code screen that waits
  // forever. `error.longMessage` is Clerk's own user-facing sentence.
  const dispatch = prepared.firstFactorVerification;
  if (dispatch?.status === 'failed' || dispatch?.status === 'expired') {
    return {
      kind: 'send_failed',
      message: dispatch.error?.longMessage || dispatch.error?.message || undefined,
    };
  }

  return { kind: 'code_sent', sentTo: emailFactor.safeIdentifier };
};

export const attemptEmailVerification = async (
  session: SessionResource,
  code: string
): Promise<VerificationAttempt> => {
  const verification = await session.attemptFirstFactorVerification({
    strategy: 'email_code',
    code,
  });

  if (verification.status === 'complete') return { kind: 'complete' };
  if (verification.status === 'needs_second_factor') return { kind: 'needs_second_factor' };
  return { kind: 'rejected' };
};

/**
 * Turns a Clerk OAuth provider id into something a person would recognise.
 * `externalAccounts[].provider` is `oauth_google` on some versions and plain
 * `google` on others, so the prefix is stripped rather than matched on.
 */
export const describeProvider = (provider?: string): string => {
  if (!provider) return 'a social account';
  const bare = provider.replace(/^oauth_/, '').toLowerCase();
  const known: Record<string, string> = {
    google: 'Google',
    apple: 'Apple',
    facebook: 'Facebook',
  };
  return known[bare] ?? 'a social account';
};
