/**
 * Editing a catalogue plate before logging it (checklist m5-01, step 4b).
 *
 * Approved design: claude_memory/database redesign/meal planning redesign/
 * PLANNER_PLATE_EDIT.html (decided 2026-11-19). On the plate's detail page the
 * user can change each food's portion (half steps) and serving size, remove a
 * food (and add it back), or reset to the planner's plate. Everything is
 * recomputed on the phone from each food's nutrition per 100 g, which the
 * backend sends for exactly this reason, so editing never waits on a network.
 *
 * Rules kept here, pure and tested:
 *   - unknown nutrients stay null all the way to the screen ("–"), never 0;
 *   - the last food cannot be removed;
 *   - the title follows the foods that are left;
 *   - nutrition uses the 7 lines of an Australian nutrition label, with %DI on
 *     the FSANZ reference values (Standard 1.2.8, as at 29 October 2024).
 */

export type Serving = { description: string; grams: number; isDefault?: boolean };

export type PlateFoodInput = {
  id?: string;
  externalId?: string;
  title?: string;
  food_name?: string;
  role?: string;
  image?: string;
  grams?: number;
  quantity?: number;
  serving?: Serving;
  servings?: Serving[];
  per100g?: Record<string, number | null>;
};

export type EditableFood = {
  key: string;
  externalId: string;
  title: string;
  name: string;
  role: string;
  image: string;
  serving: Serving;
  quantity: number;
  options: Serving[];
  per100g: Record<string, number | null>;
  removed: boolean;
};

export const QUANTITY_STEP = 0.5;
export const QUANTITY_MIN = 0.5;
export const QUANTITY_MAX = 10;
const HUNDRED_GRAMS: Serving = { description: "100 g", grams: 100 };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;

/** The food's own serving sizes plus 100 g, deduplicated by grams, smallest first. */
export const servingOptions = (food: PlateFoodInput): Serving[] => {
  const seen = new Set<string>();
  const out: Serving[] = [];
  for (const s of [...(food.servings || []), HUNDRED_GRAMS]) {
    const grams = num(s?.grams);
    if (!s?.description || !grams || grams <= 0) continue;
    const key = grams.toFixed(1);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ description: s.description, grams, isDefault: !!s.isDefault });
  }
  return out.sort((a, b) => a.grams - b.grams);
};

/** Plate item (from the planner) -> editable food. */
export const toEditableFood = (food: PlateFoodInput, index: number): EditableFood => {
  const options = servingOptions(food);
  const serving: Serving =
    food.serving && num(food.serving.grams)
      ? { description: food.serving.description, grams: Number(food.serving.grams) }
      : options.find((o) => o.isDefault) || options[0] || HUNDRED_GRAMS;
  return {
    key: `${food.externalId || food.id || "food"}-${index}`,
    externalId: String(food.externalId || food.id || "").trim(),
    title: String(food.title || food.food_name || "Food").trim(),
    name: String(food.food_name || food.title || "Food").trim(),
    role: food.role || (index === 0 ? "main" : "side"),
    image: typeof food.image === "string" ? food.image : "",
    serving,
    quantity: num(food.quantity) || 1,
    options,
    per100g: food.per100g || {},
    removed: false,
  };
};

export const initialPlate = (items: PlateFoodInput[] = []): EditableFood[] => items.map(toEditableFood);

/** Half steps between 0.5 and 10. */
export const stepQuantity = (quantity: number, direction: 1 | -1): number => {
  const next = Math.round((quantity + direction * QUANTITY_STEP) * 2) / 2;
  return Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, next));
};

export const gramsOf = (food: EditableFood): number => round(food.serving.grams * food.quantity, 1);

/** Nutrients for this food's portion. Unknown (null) stays null. */
export const nutrientsOf = (food: EditableFood): Record<string, number | null> => {
  const grams = gramsOf(food);
  const out: Record<string, number | null> = {};
  for (const [key, per100] of Object.entries(food.per100g || {})) {
    const v = num(per100);
    out[key] = v === null ? null : round((v * grams) / 100);
  }
  return out;
};

/** kcal for nutrients, from kcal or else kJ. */
export const kcalOf = (nutrients: Record<string, number | null>): number => {
  const kcal = num(nutrients.calories_kcal);
  if (kcal !== null) return kcal;
  const kj = num(nutrients.energy_kj);
  return kj !== null ? kj / 4.184 : 0;
};

export const activeFoods = (foods: EditableFood[]) => foods.filter((f) => !f.removed);

/** Whole-plate totals over the foods not removed. A key is null only if every food's value is null. */
export const plateNutrients = (foods: EditableFood[]): Record<string, number | null> => {
  const out: Record<string, number | null> = {};
  for (const food of activeFoods(foods)) {
    for (const [key, v] of Object.entries(nutrientsOf(food))) {
      if (v === null) {
        if (!(key in out)) out[key] = null;
      } else {
        out[key] = round((out[key] ?? 0) + v);
      }
    }
  }
  return out;
};

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "Salmon, brown rice & broccolini", from the foods that are left (same rule as the backend). */
export const plateTitle = (foods: EditableFood[]): string => {
  const names = activeFoods(foods).map((f) => f.title);
  if (names.length === 0) return "";
  const [first, ...rest] = names;
  if (rest.length === 0) return first;
  const tail = rest.map(lowerFirst);
  return tail.length === 1 ? `${first} & ${tail[0]}` : `${first}, ${tail.slice(0, -1).join(", ")} & ${tail[tail.length - 1]}`;
};

export const canRemove = (foods: EditableFood[]) => activeFoods(foods).length > 1;

/** Has anything changed from the planner's plate? */
export const isEdited = (foods: EditableFood[], original: EditableFood[]): boolean =>
  foods.some((f, i) => {
    const o = original[i];
    return !o || f.removed !== o.removed || f.quantity !== o.quantity || f.serving.grams !== o.serving.grams;
  });

const fmtQty = (q: number) => (q === 0.5 ? "½" : Number.isInteger(q) ? String(q) : `${Math.floor(q)}½`);

/** "1½ × 1 cup (250 ml)" */
export const portionLabel = (food: EditableFood) => `${fmtQty(food.quantity)} × ${food.serving.description}`;

/** One meal_logs row per food left on the plate, in the shape the app's batch save sends. */
export const logRowsFor = (foods: EditableFood[]) =>
  activeFoods(foods).map((food) => {
    const n = nutrientsOf(food);
    return {
      foodName: food.name,
      calories: Math.round(kcalOf(n)),
      protein: round(n.protein_g ?? 0, 1),
      carbs: round(n.carbohydrate_g ?? 0, 1),
      fats: round(n.fat_g ?? 0, 1),
      image: food.image,
      externalId: food.externalId,
      source: "catalog",
      servingId: "",
      servingDescription: portionLabel(food),
      // Same keys as a catalogue-search log, unknown kept as null.
      nutrients: { ...n, serving_grams: gramsOf(food) } as Record<string, number | null>,
    };
  });

// ---- the nutrition panel ----------------------------------------------------

/** FSANZ %DI reference values (Standard 1.2.8, as at 29 October 2024). */
export const DI_REFERENCE = Object.freeze({
  energy_kj: 8700, protein_g: 50, fat_g: 70, saturated_fat_g: 24,
  carbohydrate_g: 310, sugar_g: 90, sodium_mg: 2300, fiber_g: 30,
});

export type NutritionRow = { key: string; label: string; value: string; di: string; indent: boolean; group?: string };

const ROWS_SUMMARY: [string, string, string, boolean][] = [
  ["protein_g", "Protein", "g", false],
  ["fat_g", "Fat, total", "g", false],
  ["saturated_fat_g", "saturated", "g", true],
  ["carbohydrate_g", "Carbohydrate", "g", false],
  ["sugar_g", "sugars", "g", true],
  ["sodium_mg", "Sodium", "mg", false],
];
const ROWS_MORE: [string, string, string, boolean, string][] = [
  ["fiber_g", "Dietary fibre", "g", false, "MORE DETAIL"],
  ["trans_fat_g", "trans fat", "g", true, "MORE DETAIL"],
  ["polyunsaturated_fat_g", "polyunsaturated", "g", true, "MORE DETAIL"],
  ["monounsaturated_fat_g", "monounsaturated", "g", true, "MORE DETAIL"],
  ["cholesterol_mg", "Cholesterol", "mg", false, "MORE DETAIL"],
  ["potassium_mg", "Potassium", "mg", false, "VITAMINS & MINERALS"],
  ["calcium_mg", "Calcium", "mg", false, "VITAMINS & MINERALS"],
  ["iron_mg", "Iron", "mg", false, "VITAMINS & MINERALS"],
  ["vitamin_d_mcg", "Vitamin D", "mcg", false, "VITAMINS & MINERALS"],
  ["vitamin_a_mcg", "Vitamin A", "mcg", false, "VITAMINS & MINERALS"],
  ["vitamin_c_mg", "Vitamin C", "mg", false, "VITAMINS & MINERALS"],
];

/** A value for display: "–" when unknown, never "0". */
export const formatAmount = (value: number | null | undefined, unit: string): string => {
  const v = num(value);
  if (v === null) return "–";
  const shown = unit === "mg" || unit === "mcg" ? (v >= 10 ? Math.round(v) : round(v, 1)) : round(v, 1);
  return `${shown} ${unit}`;
};

/** %DI, only where Australia defines a reference value; blank otherwise, "–" when unknown. */
export const formatDi = (key: string, value: number | null | undefined): string => {
  const ref = (DI_REFERENCE as Record<string, number>)[key];
  if (!ref) return "";
  const v = num(value);
  if (v === null) return "–";
  return `${Math.round((v / ref) * 100)}%`;
};

const toRow = ([key, label, unit, indent]: [string, string, string, boolean], n: Record<string, number | null>, group?: string): NutritionRow => ({
  key, label, value: formatAmount(n[key], unit), di: formatDi(key, n[key]), indent, group,
});

/** The panel's rows: always the 7-line summary; the rest only when expanded. */
export const nutritionPanel = (n: Record<string, number | null>) => ({
  energyKj: num(n.energy_kj) ?? (num(n.calories_kcal) !== null ? Number(n.calories_kcal) * 4.184 : null),
  kcal: num(n.calories_kcal) ?? (num(n.energy_kj) !== null ? Number(n.energy_kj) / 4.184 : null),
  energyDi: formatDi("energy_kj", num(n.energy_kj) ?? (num(n.calories_kcal) !== null ? Number(n.calories_kcal) * 4.184 : null)),
  summary: ROWS_SUMMARY.map((r) => toRow(r, n)),
  more: ROWS_MORE.map(([key, label, unit, indent, group]) => toRow([key, label, unit, indent], n, group)),
});

export const DI_FOOTNOTE = "*Percentage daily intakes are based on an average adult diet of 8,700 kJ.";
