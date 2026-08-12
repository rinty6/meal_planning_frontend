/**
 * RECOVERY EMAIL HANDOFF
 *
 * Carries one email address from whoever starts recovery to the recovery route,
 * so the address the user already typed is not asked for twice.
 *
 * Why not a route param: on a web build expo-router puts params in the address
 * bar, and an email is personal data that has no business in a URL. This is
 * module state — it never leaves memory, never gets serialised into navigation
 * history, and never reaches a log.
 *
 * Deliberately single-slot and read-once. `takeRecoveryEmail` clears as it
 * reads, so a stale address from an abandoned attempt cannot resurface in a
 * later, unrelated one.
 */

let pendingEmail: string | null = null;

export const setRecoveryEmail = (email: string) => {
  pendingEmail = email;
};

/** Returns the pending address and clears it. Safe to call when nothing is set. */
export const takeRecoveryEmail = (): string => {
  const email = pendingEmail ?? '';
  pendingEmail = null;
  return email;
};

export const clearRecoveryEmail = () => {
  pendingEmail = null;
};
