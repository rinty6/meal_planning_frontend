/**
 * Energy units: the ONE place the app converts and formats food energy.
 *
 * Decision 2026-09-18 (checklist p0-02 / Phase 8): the app is for an
 * Australian audience, so every screen DISPLAYS kilojoules. Storage stays in
 * kcal (meal_logs.calories, favourites, recipes, users.daily_calories) because
 * kcal → kJ is an exact constant and the target-band maths, insights and
 * their tests all run in kcal. So: numbers travel as kcal, and cross the
 * screen boundary through formatEnergy(); user input crosses back through
 * parseEnergyInput(). No screen may print "kcal" or "kJ" on its own.
 *
 * The unit is a parameter with a kJ default, so a per-user kJ/kcal toggle
 * later (checklist p6-03) is one store read at the call sites.
 *
 * Dependency-free on purpose: tested with plain `node --test`.
 */

export const KJ_PER_KCAL = 4.184;

export type EnergyUnit = "kJ" | "kcal";

export const DEFAULT_ENERGY_UNIT: EnergyUnit = "kJ";

export const kcalToKj = (kcal: number): number => kcal * KJ_PER_KCAL;

export const kjToKcal = (kj: number): number => kj / KJ_PER_KCAL;

// null / undefined / "" are "unknown", never 0: Number(null) is 0, which is
// exactly the fake zero this module exists to keep off the screen.
const toFinite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

// "8368" → "8,368". Manual grouping: Hermes' Intl support varies by RN
// version and a thousands separator must not depend on it.
const groupThousands = (integer: number): string =>
  String(Math.abs(integer)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Whole-number energy in the display unit, from a stored kcal value.
 * Returns null for null/undefined/NaN so callers can render a placeholder
 * instead of a fake "0".
 */
export const energyValue = (kcal: unknown, unit: EnergyUnit = DEFAULT_ENERGY_UNIT): number | null => {
  const value = toFinite(kcal);
  if (value === null) return null;
  return Math.round(unit === "kJ" ? kcalToKj(value) : value);
};

export type FormatEnergyOptions = {
  unit?: EnergyUnit;
  /** Append the unit label ("8,368 kJ"). Default true. */
  withUnit?: boolean;
  /** Rendered when the value is unknown. Default "–". */
  placeholder?: string;
};

/**
 * Display string for a stored kcal value: formatEnergy(2000) → "8,368 kJ".
 * A negative input is clamped to 0: energy cannot be negative on screen.
 */
export const formatEnergy = (kcal: unknown, options: FormatEnergyOptions = {}): string => {
  const { unit = DEFAULT_ENERGY_UNIT, withUnit = true, placeholder = "–" } = options;
  const value = energyValue(kcal, unit);
  if (value === null) return placeholder;
  const text = groupThousands(Math.max(0, value));
  return withUnit ? `${text} ${unit}` : text;
};

/** The unit label alone, for column headers and input labels. */
export const energyUnitLabel = (unit: EnergyUnit = DEFAULT_ENERGY_UNIT): string => unit;

/**
 * Parse what a user typed in an energy field, in the display unit, into kcal
 * for storage. Accepts "8,700", "8700", "8 700", "8700 kJ". Returns null for
 * anything that is not a non-negative number.
 */
export const parseEnergyInput = (text: unknown, unit: EnergyUnit = DEFAULT_ENERGY_UNIT): number | null => {
  const cleaned = String(text ?? "")
    .replace(/kj|kcal|cal/gi, "")
    .replace(/[,\s]/g, "")
    .trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  // Round to 0.01 kcal so 418.4 kJ stores as 100, not 99.99999999999999.
  const kcal = unit === "kJ" ? kjToKcal(value) : value;
  return Math.round(kcal * 100) / 100;
};
