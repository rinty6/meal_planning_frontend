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

export type MealLogSuccessPip = Extract<PipState, 'eating' | 'happy' | 'confident'>;

export type MealLogOutcome = {
  kind: 'success';
  title: string;
  message: string;
  pip: MealLogSuccessPip;
  actionLabel: string;
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

const mealLabel = (mealType: string) => String(mealType || 'meal').trim().toLowerCase();

export const resolveMealLogOutcome = (payload: unknown, context: MealLogContext): MealLogOutcome => {
  const body = payload as { reachedTarget?: unknown } | null;
  const zone = zoneFromPayload(payload);

  if (zone === 'over') {
    return {
      kind: 'success',
      title: 'Over your target',
      message: 'Food added. Tomorrow is a clean slate.',
      pip: 'confident',
      actionLabel: 'Confirm',
    };
  }

  if (body?.reachedTarget) {
    return {
      kind: 'success',
      title: 'Calorie Target Reached',
      message: "Great job! You're on target for today.",
      pip: 'happy',
      actionLabel: 'Confirm',
    };
  }

  const verb = context.plural ? 'are' : 'is';
  return {
    kind: 'success',
    title: 'Added successfully!',
    message: `${context.itemLabel} ${verb} in your ${mealLabel(context.mealType)}.`,
    pip: 'eating',
    actionLabel: 'Confirm',
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
