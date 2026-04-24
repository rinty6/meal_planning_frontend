export type MealType = "breakfast" | "lunch" | "dinner";

export type ItemsByMeal = Record<MealType, any[]>;

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

export const LOADING_MESSAGES = [
  "Analyzing your eating patterns...",
  "Mapping your calorie goals...",
  "Finding best matching food items...",
];

export const createEmptyItemsByMeal = (): ItemsByMeal => ({
  breakfast: [],
  lunch: [],
  dinner: [],
});

export const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
