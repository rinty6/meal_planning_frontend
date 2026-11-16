/**
 * The meal types a log can have (checklist m4-09). This is the ONE list for
 * the app: every log sheet, Meal Summary and Recent Meals read it, so a new
 * type is one edit here. The backend twin is src/services/mealTypes.js.
 *
 * Order is breakfast, lunch, dinner, snack (decision D1). Snack is last
 * because it can happen at any time of day.
 *
 * Snack is never expected and never pre-selected (D2). Code that deals in
 * the three EXPECTED meals keeps its own type on purpose: the planner
 * (services/planning.*, until m5-04), Pip (components/pip/pipHomeState.ts)
 * and the time-of-day default on Home (app/(tabs)/index.tsx).
 */

import type { Ionicons } from '@expo/vector-icons';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealTypeEntry = {
  type: MealType;
  /** Shown everywhere the type is named: rows, buttons, section titles. */
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Tailwind background class for the Meal Summary section header. */
  colorClass: string;
  /** Meal Summary text when nothing is logged for this type. */
  emptyText: string;
};

export const MEAL_TYPE_ENTRIES: readonly MealTypeEntry[] = Object.freeze([
  { type: 'breakfast', label: 'Breakfast', icon: 'partly-sunny', colorClass: 'bg-primary', emptyText: 'No food logged yet.' },
  { type: 'lunch', label: 'Lunch', icon: 'sunny', colorClass: 'bg-secondary', emptyText: 'No food logged yet.' },
  { type: 'dinner', label: 'Dinner', icon: 'moon', colorClass: 'bg-dinner', emptyText: 'No food logged yet.' },
  // Green #15803D (D3). The empty text is gentler on purpose: a day without a
  // snack is a normal day, so it must not read like a nudge to eat more.
  { type: 'snack', label: 'Snack', icon: 'nutrition', colorClass: 'bg-snack', emptyText: "Nothing between meals. That's fine." },
]);

/** The type values alone, in display order. */
export const MEAL_TYPES: readonly MealType[] = Object.freeze(MEAL_TYPE_ENTRIES.map((entry) => entry.type));

/** True when `value` is a meal type, ignoring case and outer spaces. */
export const isMealType = (value: unknown): value is MealType =>
  typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value.trim().toLowerCase());

/** "Snack" for "snack" or "SNACK". Unknown values are capitalised as they are. */
export const mealTypeLabel = (type: string): string => {
  const normalized = String(type || '').trim().toLowerCase();
  const entry = MEAL_TYPE_ENTRIES.find((item) => item.type === normalized);
  if (entry) return entry.label;
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
};
