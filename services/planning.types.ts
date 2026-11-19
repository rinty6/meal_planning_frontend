// A1, 2026-11-20: the planner plans all four meal types, snack included
// (m5-04, m6-01). The list is the app's one list (constants/mealTypes.ts),
// imported here so the planning screen can never drift from it.
import { MEAL_TYPES as ALL_MEAL_TYPES, type MealType as AppMealType } from "../constants/mealTypes";

export type MealType = AppMealType;

export type ItemsByMeal = Record<MealType, any[]>;

export const MEAL_TYPES: readonly MealType[] = ALL_MEAL_TYPES;

export const LOADING_MESSAGES = [
  "Analyzing your eating patterns...",
  "Mapping your calorie goals...",
  "Finding best matching food items...",
];

export const createEmptyItemsByMeal = (): ItemsByMeal => ({
  breakfast: [],
  lunch: [],
  dinner: [],
  snack: [],
});

export const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
