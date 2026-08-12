/**
 * RECOVERY EMAIL HANDOFF
 *
 * Carries one email address to the recovery route, so an address the user has
 * already typed is not asked for twice.
 *
 * Why not a route param: `typedRoutes` is on and on a web build expo-router puts
 * params in the address bar. An email is personal data with no business in a
 * URL. This is module state — it never leaves memory, never serialises into
 * navigation history, and never reaches a log.
 *
 * Deliberately single-slot and read-once. `takeRecoveryEmail` clears as it
 * reads, so a stale address from an abandoned attempt cannot resurface in a
 * later, unrelated one.
 *
 * THE PENDING FLAG exists because of a navigation race. The change-password
 * handoff has to `signOut` before recovery can start, and the moment
 * `isSignedIn` flips, `(tabs)/_layout.tsx` renders `<Redirect href="/(auth)/sign-in" />`.
 * That competes with the handoff's own `router.replace`, and a declarative
 * redirect driven by a state change can easily win. Rather than gamble on the
 * ordering, the handoff marks itself pending; sign-in checks the flag on mount
 * and forwards. Whichever navigation lands first, the user reaches recovery.
 */

let pendingEmail: string | null = null;
let handoffPending = false;

/** Prefill only. Used where recovery is entered directly and no sign-out happens. */
export const setRecoveryEmail = (email: string) => {
  pendingEmail = email;
};

/**
 * Prefill AND "forward me to recovery once you land on sign-in". Only the
 * signed-in change-password handoff needs this.
 */
export const startRecoveryHandoff = (email: string) => {
  pendingEmail = email;
  handoffPending = true;
};

/** Peek without consuming — sign-in uses this to decide whether to forward. */
export const isRecoveryHandoffPending = () => handoffPending;

/** Returns the pending address and clears everything. Safe when nothing is set. */
export const takeRecoveryEmail = (): string => {
  const email = pendingEmail ?? '';
  pendingEmail = null;
  handoffPending = false;
  return email;
};

export const clearRecoveryEmail = () => {
  pendingEmail = null;
  handoffPending = false;
};
