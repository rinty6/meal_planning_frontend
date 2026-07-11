// Single source of truth for recipe per-serving <-> whole-recipe math.
//
// Recipes carry PER-SERVING macros (FatSecret recipe.get / recipes.search /
// recommendations) plus a yield (number_of_servings). Whole-recipe totals are
// ALWAYS derived (perServing x servings) and never stored, so the two views can
// never drift. TheMealDB is the inverse (whole-recipe data, servings estimated
// offline) and custom recipes store whole-recipe values directly — both of those
// already equal the total, so callers simply skip scaling for them.

export type RecipeMacros = { calories: number; protein: number; carbs: number; fats: number };

const num = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Servings as a positive integer (>= 1). Accepts a raw number or the free-text
// serving pill ("14 servings", "Whole recipe"); non-numeric text falls back to 1.
export const getServingsCount = (value: any): number => {
  const match = typeof value === "string" ? value.match(/\d+(?:\.\d+)?/) : null;
  const raw = match ? Number(match[0]) : num(value);
  const n = Math.round(num(raw));
  return n > 0 ? n : 1;
};

// One per-serving value -> whole-recipe total.
export const toWholeRecipe = (perServingValue: any, servings: any): number =>
  num(perServingValue) * getServingsCount(servings);

// A whole per-serving macro set -> whole-recipe totals.
export const scaleMacros = (perServing: RecipeMacros, servings: any): RecipeMacros => {
  const k = getServingsCount(servings);
  return {
    calories: num(perServing.calories) * k,
    protein: num(perServing.protein) * k,
    carbs: num(perServing.carbs) * k,
    fats: num(perServing.fats) * k,
  };
};

// Display formatters (round only here, never in the stored/canonical values).
export const formatKcal = (value: any): number => Math.round(num(value));
export const formatGrams = (value: any): string => `${(Math.round(num(value) * 10) / 10).toFixed(1)}g`;
