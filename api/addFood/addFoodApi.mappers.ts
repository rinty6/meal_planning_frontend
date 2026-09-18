/**
 * api/addFood/addFoodApi.mappers.ts — raw catalogue hit → Design 3 card.
 *
 * Serves: components/addfoodmodal.tsx via addFoodApi.ts.
 * Calls: nothing. Pure functions, tested with plain `node --test`.
 *
 * Title rule (checklist p0-03, decided 2026-09-17): for a generic AUSNUT row,
 * title = Cap(base_name) + ", " + first segment, with any trailing "(…)"
 * qualifier of that segment moved into a chip; the remaining segments are
 * chips. "Chicken, breast, lean, raw" → title "Chicken, breast", chips
 * [lean, raw]. "Beer, full strength (alcohol 4-4.9% v/v), low carbohydrate"
 * → title "Beer, full strength", chips ["alcohol 4-4.9% v/v", "low
 * carbohydrate"]. A branded (Open Food Facts) row keeps its name as the title
 * and shows the brand as the tag; its name_segments are empty so no chips.
 *
 * Energy stays in kcal on the VM and is formatted by utils/energy.ts at the
 * screen, so the card, the Summary total and meal_logs.calories all derive
 * from the same stored number.
 */

import type { CatalogFoodHit, FoodCardTag, FoodCardVM, LoggableFood } from "./addFoodApi.types";

const capitalise = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const TRAILING_QUALIFIER = /^(.*?)\s*\(([^()]*)\)\s*$/;

/** Split "full strength (alcohol 4-4.9% v/v)" into ["full strength", "alcohol 4-4.9% v/v"]. */
export const splitQualifier = (segment: string): { head: string; qualifier: string | null } => {
  const match = segment.match(TRAILING_QUALIFIER);
  if (!match || !match[1].trim()) return { head: segment.trim(), qualifier: null };
  return { head: match[1].trim(), qualifier: match[2].trim() || null };
};

export const buildTitleAndChips = (hit: CatalogFoodHit): { title: string; chips: string[] } => {
  const isGeneric = hit.food_type === "generic";
  const segments = Array.isArray(hit.name_segments) ? hit.name_segments.filter((s) => s && s.trim()) : [];

  if (!isGeneric || segments.length === 0) {
    const fallback = isGeneric && hit.base_name ? capitalise(hit.base_name) : hit.title;
    return { title: fallback || hit.title, chips: [] };
  }

  const [first, ...rest] = segments;
  const { head, qualifier } = splitQualifier(first);
  const base = hit.base_name ? capitalise(hit.base_name) : null;
  const title = base ? `${base}, ${head}` : capitalise(head);
  const chips = [...(qualifier ? [qualifier] : []), ...rest];
  return { title, chips };
};

export const buildTag = (hit: CatalogFoodHit): FoodCardTag => {
  if (hit.brand && hit.brand.trim()) return { kind: "brand", name: hit.brand.trim() };
  if (hit.food_type === "generic") return { kind: "generic" };
  return { kind: "none" };
};

/**
 * Open Food Facts serving descriptions are noisy ("250 mlper (250 ml)",
 * "250 ml (250 ml)"). When the bracketed part merely repeats the prefix, keep
 * the bracketed part. Household measures ("1 thigh, large (174 g)") are left
 * alone because the prefix carries information the bracket does not.
 * Proper normalisation belongs in the importer (checklist p6-06).
 */
export const formatServing = (description: string | null | undefined): string => {
  const text = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "1 serving";
  const match = text.match(TRAILING_QUALIFIER);
  if (!match) return text;
  const prefix = match[1].replace(/[^a-z0-9.]/gi, "").toLowerCase();
  const inner = match[2].trim();
  const innerKey = inner.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  if (innerKey && prefix.startsWith(innerKey)) return inner;
  return text;
};

/** "0g" for zero, else one decimal: 11.5312 → "11.5g". Unknown → "–". */
export const formatGrams = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  if (value === 0) return "0g";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}g`;
};

export const toFoodCardVM = (hit: CatalogFoodHit): FoodCardVM => {
  const { title, chips } = buildTitleAndChips(hit);
  return {
    key: hit.public_id,
    title,
    tag: buildTag(hit),
    chips,
    servingLabel: formatServing(hit.serving?.description),
    energyKcal: hit.nutrition?.calories_kcal ?? null,
    proteinG: hit.nutrition?.protein_g ?? null,
    fatG: hit.nutrition?.fat_g ?? null,
    carbG: hit.nutrition?.carbohydrate_g ?? null,
    hit,
  };
};

const numberOrZero = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * The object handed to onAddFood(). One default serving, servings = 1.
 * The brand is folded into the logged name so a branded row reads correctly
 * in the meal log ("Tim Tam (Arnott's)").
 */
export const toLoggableFood = (vm: FoodCardVM): LoggableFood => {
  const { hit } = vm;
  const name = vm.tag.kind === "brand" ? `${vm.title} (${vm.tag.name})` : vm.title;
  return {
    title: name,
    calories: numberOrZero(hit.nutrition.calories_kcal),
    protein: numberOrZero(hit.nutrition.protein_g),
    carbs: numberOrZero(hit.nutrition.carbohydrate_g),
    fats: numberOrZero(hit.nutrition.fat_g),
    image: hit.image_url ?? "",
    externalId: hit.public_id,
    source: "catalog",
    servingId: String(hit.serving.id),
    servingDescription: vm.servingLabel,
    servings: 1,
    nutrients: { ...hit.nutrition, serving_grams: hit.serving.grams_equivalent ?? null },
  };
};
