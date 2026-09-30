// The ONE place that builds the body for POST /api/meals/add.
//
// Why this file exists
// --------------------
// Six screens hand-built this body: Home, Summary, Planning, Combo detail,
// Recipe detail and Voice Search. Six copies of one contract, and Home alone
// dropped a field twice in one sprint:
//
//   * `mealType` was inferred from the clock, so a dinner scan landed in
//     breakfast (barcode redesign, b0-03).
//   * `servings` was never sent, so a 2-serving scan stored the doubled total
//     against servings=1. The summary read "1" and its stepper would have
//     rescaled from the wrong base (ERROR_LOG Error 061, device round 4).
//
// Neither was a hard failure. Both were a field quietly missing from one of
// six near-identical object literals, which is exactly the bug a shared
// builder makes impossible.
//
// The contract, as the backend reads it
// -------------------------------------
// `meal_logs` stores the TOTAL in calories/protein/carbs/fats and the
// multiplier in `servings`. Per-serving is derived as total / servings. So a
// caller passes totals, and if it holds per-serving numbers it scales them
// with `scaleToTotals` rather than inventing its own `* logServings`.
//
// The backend coerces missing numbers to 0 and a missing `servings` to 1, so
// an omitted field is silently wrong rather than rejected. That is the reason
// the required fields below throw here instead.

export type AddMealNumeric = number | string | null | undefined;

export type AddMealInput = {
  clerkId: string;
  /** Local calendar date, YYYY-MM-DD. Use formatLocalYYYYMMDD, never toISOString. */
  date: string;
  /** Always explicit. Never inferred from the clock (b0-03). */
  mealType: string;
  foodName: string;

  /** TOTALS, already multiplied by `servings`. See scaleToTotals. */
  calories: AddMealNumeric;
  protein: AddMealNumeric;
  carbs: AddMealNumeric;
  fats: AddMealNumeric;

  /** The multiplier the totals were scaled by. Omitted means 1. */
  servings?: AddMealNumeric;

  image?: string | null;
  externalId?: string | number | null;
  source?: string | null;
  servingId?: string | number | null;
  servingDescription?: string | null;
  nutrients?: Record<string, unknown> | null;
};

export type AddMealBody = {
  clerkId: string;
  date: string;
  mealType: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  servings: number;
  image: string;
  externalId?: string;
  source?: string;
  servingId?: string;
  servingDescription?: string;
  nutrients: Record<string, unknown>;
};

export const UNKNOWN_FOOD_NAME = "Unknown item";

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Two decimal places. A test once caught 470 / 4.184 = 112.33269598470363
 *  heading for meal_logs.calories; rounding belongs in one place. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

const num = (value: AddMealNumeric): number => {
  const parsed = typeof value === "string" ? parseFloat(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
};

/** '' and null both mean "no value" to the backend, which stores NULL either
 *  way. Normalising to undefined keeps the body small and makes the two
 *  spellings one thing rather than two. */
const text = (value: string | number | null | undefined): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed === "" ? undefined : trimmed;
};

/**
 * Per-serving numbers to the totals the contract wants.
 *
 * Every caller that lets the user pick a quantity was doing this inline, and
 * doing it slightly differently. Recipe detail also divides by a unit divisor
 * first, because its source numbers are sometimes whole-dish; that stays its
 * business, and it hands the per-serving result here.
 */
export const scaleToTotals = (
  perServing: { calories: AddMealNumeric; protein: AddMealNumeric; carbs: AddMealNumeric; fats: AddMealNumeric },
  servings: AddMealNumeric,
): { calories: number; protein: number; carbs: number; fats: number; servings: number } => {
  const multiplier = num(servings) > 0 ? num(servings) : 1;
  return {
    calories: round2(num(perServing.calories) * multiplier),
    protein: round2(num(perServing.protein) * multiplier),
    carbs: round2(num(perServing.carbs) * multiplier),
    fats: round2(num(perServing.fats) * multiplier),
    servings: multiplier,
  };
};

/** Thrown before the request leaves, so a missing field is a bug report rather
 *  than a wrong row in someone's food diary. */
export class AddMealPayloadError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "AddMealPayloadError";
    this.field = field;
  }
}

export const buildAddMealBody = (input: AddMealInput): AddMealBody => {
  const clerkId = text(input.clerkId);
  if (!clerkId) throw new AddMealPayloadError("clerkId", "Not signed in.");

  if (!DATE_SHAPE.test(String(input.date ?? ""))) {
    // The backend answers 400 for this, which surfaces as a generic failure
    // card. Catching the shape here names the actual problem.
    throw new AddMealPayloadError("date", `date must be YYYY-MM-DD, got ${String(input.date)}`);
  }

  const mealType = text(input.mealType);
  if (!mealType) {
    throw new AddMealPayloadError("mealType", "mealType is required and is never inferred from the clock.");
  }

  const servings = num(input.servings) > 0 ? num(input.servings) : 1;

  return {
    clerkId,
    date: input.date,
    mealType,
    foodName: text(input.foodName) ?? UNKNOWN_FOOD_NAME,
    calories: round2(num(input.calories)),
    protein: round2(num(input.protein)),
    carbs: round2(num(input.carbs)),
    fats: round2(num(input.fats)),
    servings,
    image: text(input.image) ?? "",
    externalId: text(input.externalId),
    source: text(input.source),
    servingId: text(input.servingId),
    servingDescription: text(input.servingDescription),
    nutrients: input.nutrients && typeof input.nutrients === "object" ? input.nutrients : {},
  };
};
