/**
 * Client mirror of backend/src/services/calorieTargetBand.js.
 *
 * The backend owns the authoritative answer and returns `targetZone` on every
 * meal-add response — prefer that when you have it. This exists for the screens
 * that decide locally from cached numbers (the home Pip card), where making a
 * request just to classify a total the client already has would be absurd.
 *
 * KEEP THE TOLERANCE IN SYNC with the backend file. If they ever disagree, the
 * home card and the confirmation dialog will tell the user different things
 * about the same meal.
 */

export const CALORIE_TARGET_TOLERANCE = 0.1;

export type CalorieZone = 'under' | 'on_target' | 'over';

export const getCalorieTargetBand = (target: number) => {
  const safeTarget = Number(target) > 0 ? Number(target) : 0;
  return {
    lower: safeTarget * (1 - CALORIE_TARGET_TOLERANCE),
    upper: safeTarget * (1 + CALORIE_TARGET_TOLERANCE),
  };
};

export const resolveCalorieZone = (total: number, target: number): CalorieZone => {
  const safeTarget = Number(target) > 0 ? Number(target) : 0;
  // No usable target means everything is "still going" — never celebrate or warn
  // off a target we do not actually have (Error 066).
  if (!safeTarget) return 'under';

  const consumed = Number(total) > 0 ? Number(total) : 0;
  const { lower, upper } = getCalorieTargetBand(safeTarget);

  if (consumed < lower) return 'under';
  if (consumed > upper) return 'over';
  return 'on_target';
};

/** Narrows an unknown server payload's targetZone, falling back to the legacy booleans. */
export const zoneFromPayload = (payload: unknown): CalorieZone => {
  const body = payload as { targetZone?: unknown; exceededLimit?: unknown } | null;
  const zone = body?.targetZone;
  if (zone === 'under' || zone === 'on_target' || zone === 'over') return zone;
  return body?.exceededLimit ? 'over' : 'under';
};
