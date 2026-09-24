/**
 * The day strip on the confirmation card (barcode checklist Phase 6).
 *
 * Asked for on 2026-09-22 and deliberately NOT barcode-specific: it reads the
 * numbers the meal-add response already returns, so every commit that goes
 * through resolveMealLogOutcome gets it — search, barcode, recipe, combo and
 * voice alike.
 *
 * Two rules this module exists to hold:
 *
 *   1. **Never draw a bar from a guess.** No target, no total, no strip. An
 *      offline save, a user with no goal set and an older backend all land
 *      here, and a bar drawn from a missing number is worse than no bar: it
 *      looks like a measurement. Same instinct as ERROR_LOG 066.
 *   2. **"Over" means past the BAND, not past the number.** The whole app
 *      judges a target with a 10% tolerance (services/calorieBand.ts, ERROR
 *      074), and the card's own copy uses it. If the bar flipped to orange at
 *      100.1% it would say "over" on the same card where Pip says the user is
 *      on target. The numeric label still shows the literal total, so nothing
 *      is hidden: 9,000 of 8,700 kJ reads as what it is.
 *
 * Energy: the payload is kcal, as stored. Everything shown is kJ, via
 * utils/energy.ts. This module never prints a unit itself.
 */

// `.ts` on a runtime import: Node's ESM resolver needs it for the test
// runner, and Metro resolves it fine (proved with a probe bundle, 2026-09-22).
import { formatEnergy } from "./energy.ts";

export type DayProgress = {
  /** This meal's own subtotal, kcal. Null when the server did not send one. */
  mealKcal: number | null;
  /** The whole day so far, kcal. */
  consumedKcal: number;
  /** The day's target, kcal. Always > 0 here; a missing target means no strip. */
  targetKcal: number;
  /** "dinner". Displayed capitalised. */
  mealType: string;
  /** True only past the top of the tolerance band. See rule 2. */
  over: boolean;
};

const finite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Read the strip's numbers off a meal-add response.
 *
 * Returns null whenever the strip would be a guess, which is the common case
 * on a user with no goal and on any build talking to an older backend.
 */
export const dayProgressFromPayload = (
  payload: unknown,
  mealType: string,
  options: { over?: boolean } = {},
): DayProgress | null => {
  const body = payload as
    | { dailyTotalCalories?: unknown; dailyTarget?: unknown; mealTotalCalories?: unknown }
    | null
    | undefined;
  if (!body || typeof body !== "object") return null;

  const consumedKcal = finite(body.dailyTotalCalories);
  const targetKcal = finite(body.dailyTarget);
  if (consumedKcal === null || consumedKcal < 0) return null;
  if (targetKcal === null || targetKcal <= 0) return null;

  const mealKcal = finite(body.mealTotalCalories);

  return {
    mealKcal: mealKcal !== null && mealKcal >= 0 ? mealKcal : null,
    consumedKcal,
    targetKcal,
    mealType: String(mealType || "").trim(),
    over: options.over === true,
  };
};

export type DayProgressView = {
  /** 0–100. The fill is clamped; the label carries the overflow. */
  fillPercent: number;
  /** "Dinner 2,140 kJ", or "" when the server sent no meal subtotal. */
  left: string;
  /** "Today 6,480 / 8,700 kJ", or "1,200 kJ over" past the band. */
  right: string;
  over: boolean;
};

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : "");

export const dayProgressView = (progress: DayProgress): DayProgressView => {
  const ratio = progress.consumedKcal / progress.targetKcal;
  const fillPercent = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  const meal = capitalise(progress.mealType);
  const left =
    progress.mealKcal === null
      ? ""
      : `${meal ? `${meal} ` : ""}${formatEnergy(progress.mealKcal)}`;

  const right = progress.over
    ? `${formatEnergy(progress.consumedKcal - progress.targetKcal)} over`
    : `Today ${formatEnergy(progress.consumedKcal, { withUnit: false })} / ${formatEnergy(progress.targetKcal)}`;

  return { fillPercent, left, right, over: progress.over };
};
