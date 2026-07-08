// Single source of truth for how a serving is displayed across the app.
// Keeps the meal-planning card, the food detail page, and the recipe detail page
// from showing the same serving three different ways (e.g. "85 g" vs "1 fillet").

const normalizeWhitespace = (value: any) => String(value ?? "").replace(/\s+/g, " ").trim();

const toFiniteNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Units that already fully describe a portion on their own — when the
// serving_description is just "<number> <one of these>", the metric weight is
// redundant, so we never append "(… g)" to it.
const SELF_SUFFICIENT_UNIT_TOKENS = new Set([
  "g", "gram", "grams",
  "kg", "mg",
  "ml", "l", "liter", "liters", "litre", "litres",
  "oz", "ounce", "ounces",
  "lb", "lbs", "pound", "pounds",
  "floz",
]);

// A generic, non-informative description we'd rather replace with the metric weight.
const isGenericServingDescription = (desc: string) => {
  const lower = desc.toLowerCase();
  return lower === "" || lower === "1 serving" || lower === "serving" || lower === "servings";
};

// True when the description is essentially "<number> <metric-unit>" (e.g. "100 g",
// "250 ml", "1 fl oz") and therefore needs no extra metric suffix.
const isSelfDescribingMetric = (desc: string) => {
  const match = desc.match(/^\d+(?:\.\d+)?\s+(.+)$/);
  if (!match) return false;
  const unitToken = match[1].toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  return SELF_SUFFICIENT_UNIT_TOKENS.has(unitToken);
};

// Recipe yield, e.g. "2 servings" / "1 serving". Falls back to 1 for missing/invalid input.
export const formatServingsLabel = (count: any) => {
  const n = Math.round(toFiniteNumber(count));
  const safe = n > 0 ? n : 1;
  return `${safe} ${safe === 1 ? "serving" : "servings"}`;
};

// Food serving, e.g. "1 fillet (85 g)". Prefers FatSecret's human description and
// appends the real metric weight (with the correct unit — ml, oz, … not always g)
// when it adds information. Falls back to the metric weight, then "1 serving".
export const getFoodServingText = (item: any): string => {
  const desc = normalizeWhitespace(item?.serving_description);
  const amount = Math.round(
    toFiniteNumber(item?.metric_serving_amount) || toFiniteNumber(item?.grams)
  );
  const unit = normalizeWhitespace(item?.metric_serving_unit) || "g";
  const metricStr = amount > 0 ? `${amount} ${unit}` : "";

  if (isGenericServingDescription(desc)) {
    return metricStr || (desc ? desc : "1 serving");
  }
  // Description is meaningful ("1 fillet", "2 slices"): add the metric weight unless
  // it's redundant (already metric, no metric available, or already parenthesized).
  if (!metricStr || isSelfDescribingMetric(desc) || desc.includes("(")) {
    return desc;
  }
  return `${desc} (${metricStr})`;
};

// Convenience dispatcher for callers that know whether an item is a recipe.
export const getServingText = (
  item: any,
  { isRecipe, recipeServings }: { isRecipe: boolean; recipeServings?: any }
): string =>
  isRecipe
    ? formatServingsLabel(recipeServings ?? item?.servings)
    : getFoodServingText(item);
