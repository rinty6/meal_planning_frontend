/**
 * MEAL-LOG OUTCOME RESOLVER
 *
 * One place that turns a meal-add server response (or a failure) into what the
 * Pip status card shows. Planning, Home, Meal Summary, combo/recipe detail and
 * Voice Search all used to carry their own slightly different copy of this
 * decision; that is how the same food came to say different things depending
 * on which screen logged it.
 *
 * Precedence mirrors planning.tsx's original showMealLogOutcome exactly:
 *
 *   1. zone === 'over'          -> confident  (the food was still logged)
 *   2. payload.reachedTarget    -> happy      (entered the target band)
 *   3. otherwise                -> eating     (the everyday outcome)
 *
 * Step 2 MUST stay on `reachedTarget`, never `zone === 'on_target'`. The
 * backend edge-triggers that flag on ENTERING the band from below
 * (backend/src/routes/meals.js), so it celebrates once per day; keying off the
 * zone would replay the celebration on every later log while still in band.
 * See LOADING_REDESIGN_PLAN.md, correction C2, and ERROR_LOG Error 074.
 */

import type { PipState } from '../components/pip/PipBird';
import { zoneFromPayload } from './calorieBand';
import { dayProgressFromPayload, type DayProgress } from '../utils/dayProgress';

export type MealLogSuccessPip = Extract<PipState, 'eating' | 'happy' | 'confident'>;

export type MealLogOutcome = {
  kind: 'success';
  title: string;
  message: string;
  pip: MealLogSuccessPip;
  actionLabel: string;
  /**
   * Where the day stands after this save, for the strip under the message.
   * Null when the numbers are not all there: no goal, an older backend, or a
   * payload that never arrived. Attached HERE rather than at the call sites so
   * every screen that logs a meal shows it without opting in (checklist
   * b6-04).
   */
  day: DayProgress | null;
};

export type MealLogFailure = {
  kind: 'error';
  title: string;
  message: string;
  pip: 'sad';
  actionLabel: string;
  /**
   * True when the server never answered, so whether the meal was written is
   * genuinely unknown. The copy then sends the user to the meal log before a
   * retry rather than claiming "nothing was saved" and inviting a duplicate.
   */
  ambiguous: boolean;
};

export type MealLogResult = MealLogOutcome | MealLogFailure;

export type MealLogContext = {
  /** What was logged, as the user would name it: "Grilled chicken salad", "3 items". */
  itemLabel: string;
  /** The meal slot it went into: "lunch". Displayed lowercase. */
  mealType: string;
  /** Set when itemLabel is plural ("3 items are in your lunch"). */
  plural?: boolean;
};

/**
 * Thrown by call sites when the server DID reply but with a non-OK status.
 * Carrying the status is what lets the failure copy say, truthfully, that
 * nothing was saved.
 */
export class MealLogRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MealLogRequestError';
    this.status = status;
  }
}

/**
 * Thrown by multi-item call sites (combo detail) when one item failed AFTER
 * earlier ones were written. "Nothing was saved" would be a lie and "check
 * your log" alone hides what happened, so the copy states the count.
 */
export class MealLogPartialError extends Error {
  saved: number;
  total: number;

  constructor(saved: number, total: number, cause?: unknown) {
    super(`Saved ${saved} of ${total} items`);
    this.name = 'MealLogPartialError';
    this.saved = saved;
    this.total = total;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

const mealLabel = (mealType: string) => String(mealType || 'meal').trim().toLowerCase();

export const resolveMealLogOutcome = (payload: unknown, context: MealLogContext): MealLogOutcome => {
  const body = payload as { reachedTarget?: unknown } | null;
  const zone = zoneFromPayload(payload);

  // `over` is the band's verdict, the same one the copy below uses, so the bar
  // and the words on one card can never disagree (ERROR 074).
  const day = dayProgressFromPayload(payload, context.mealType, { over: zone === 'over' });

  if (zone === 'over') {
    return {
      kind: 'success',
      title: 'Over your target',
      message: 'Food added. Tomorrow is a clean slate.',
      pip: 'confident',
      actionLabel: 'Confirm',
      day,
    };
  }

  if (body?.reachedTarget) {
    return {
      kind: 'success',
      title: 'Calorie Target Reached',
      message: "Great job! You're on target for today.",
      pip: 'happy',
      actionLabel: 'Confirm',
      day,
    };
  }

  const verb = context.plural ? 'are' : 'is';
  return {
    kind: 'success',
    title: 'Added successfully!',
    message: `${context.itemLabel} ${verb} in your ${mealLabel(context.mealType)}.`,
    pip: 'eating',
    actionLabel: 'Confirm',
    day,
  };
};

/**
 * A reply with an error status means the server ran and refused: nothing was
 * written. Anything else (a thrown fetch, a timeout, an abort) means the
 * request may or may not have landed, and the copy has to say so.
 */
export const resolveMealLogFailure = (error: unknown, context: Pick<MealLogContext, 'itemLabel'>): MealLogFailure => {
  const serverReplied = error instanceof MealLogRequestError;
  const item = context.itemLabel || 'this';

  if (error instanceof MealLogPartialError) {
    return {
      kind: 'error',
      title: 'Only part of this was added',
      message: `${error.saved} of ${error.total} items were saved. Check your meal log before trying again.`,
      pip: 'sad',
      actionLabel: 'OK',
      ambiguous: false,
    };
  }

  if (serverReplied) {
    return {
      kind: 'error',
      title: `Could not add ${item}`,
      message: 'Check your connection and try again. Nothing was saved.',
      pip: 'sad',
      actionLabel: 'Try again',
      ambiguous: false,
    };
  }

  return {
    kind: 'error',
    title: `Could not confirm ${item}`,
    message: 'The connection dropped before we heard back. Check your meal log before trying again.',
    pip: 'sad',
    actionLabel: 'OK',
    ambiguous: true,
  };
};
