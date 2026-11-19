/**
 * Catalogue plates on the planning screen (checklist m5-01, step 4a).
 *
 * A plate is one recommendation made of 2 or 3 catalogue foods (a main and
 * sides), built by the backend when MEAL_PLAN_SOURCE=catalog. Two rules live
 * here so the planning screen and its tests agree:
 *
 *   1. Saving a plate writes ONE LOG ROW PER FOOD, each with that food's own
 *      catalogue nutrition and portion, exactly as combos are saved today. So
 *      Meal Summary lists salmon, rice and broccolini separately and each can
 *      be resized or removed on its own.
 *   2. Anything that is not a plate saves exactly as before.
 *
 * Pure: no React, no network.
 */

export type PlateFood = {
  id?: string;
  externalId?: string;
  title?: string;
  food_name?: string;
  role?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  grams?: number;
  image?: string;
  serving_description?: string;
  nutrients?: Record<string, number | null>;
};

export type LogEntry = {
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  image: string;
  externalId: string;
  source: string;
  servingId: string;
  servingDescription: string;
  nutrients: Record<string, unknown>;
};

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** True for a catalogue plate from the planner. */
export const isPlate = (item: any): boolean =>
  !!item && (item.type === "plate" || item.source === "catalog_plate") && Array.isArray(item.items) && item.items.length > 0;

/** The foods on a plate, main first. Empty for anything that is not a plate. */
export const plateFoods = (item: any): PlateFood[] => (isPlate(item) ? (item.items as PlateFood[]) : []);

/** "PLATE · 3 FOODS" */
export const plateLabel = (item: any): string => `PLATE · ${plateFoods(item).length} FOODS`;

/** "Salmon 132 g · Brown rice 251 g · Broccolini 173 g": short enough for the card. */
export const plateFoodLine = (item: any): string =>
  plateFoods(item)
    .map((food) => {
      const name = String(food.title || food.food_name || "Food").trim();
      const grams = num(food.grams);
      return grams > 0 ? `${name} ${Math.round(grams)} g` : name;
    })
    .join(" · ");

/** Up to three photos for the card's cluster, main first; blanks skipped. */
export const platePhotos = (item: any): string[] =>
  plateFoods(item)
    .map((food) => (typeof food.image === "string" ? food.image.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);

/** One plate food -> one log row. Keeps unknown nutrients as null (never 0). */
const plateFoodEntry = (food: PlateFood): LogEntry => ({
  foodName: String(food.food_name || food.title || "Food").trim(),
  calories: num(food.calories),
  protein: num(food.protein),
  carbs: num(food.carbs),
  fats: num(food.fats),
  image: food.image || "",
  externalId: String(food.externalId || food.id || "").trim(),
  source: "catalog",
  servingId: "",
  servingDescription: String(food.serving_description || "").trim(),
  // Same keys as a catalogue-search log ({...nutrition, serving_grams}), so
  // every catalogue row in meal_logs reads the same way, alcohol_g included.
  nutrients: { ...(food.nutrients || {}), serving_grams: food.grams ?? null },
});

/**
 * Log rows for one planner item. A plate gives one row per food; anything
 * else gives the single row `legacyEntry` builds (the screen's existing
 * mapping, passed in so this file never has to copy it).
 */
export const logEntriesFor = (item: any, legacyEntry: (item: any) => LogEntry): LogEntry[] =>
  isPlate(item) ? plateFoods(item).map(plateFoodEntry) : [legacyEntry(item)];
