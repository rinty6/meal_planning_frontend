/**
 * api/barcode/barcodeApi.mappers.ts — scanned product → the screens, and the
 * form → what we send.
 *
 * Serves: components/addfood/Barcode*.tsx via barcodeApi.ts.
 * Calls: nothing. Pure functions, tested with plain `node --test`.
 *
 * The card mapping is deliberately NOT reimplemented here: toFoodCardVM from
 * api/addFood turns a hit into the Design 3 card, and a scanned food must look
 * exactly like a searched one. What this file adds is the part search does not
 * have: a chosen serving and a quantity, and the report form.
 *
 * Energy crosses a unit boundary in one direction only. The catalogue stores
 * kcal, so a scanned product logs kcal. The report form is typed in kJ because
 * that is what an Australian label prints, so a typed food converts once, here,
 * through utils/energy. Nothing else in the barcode path does arithmetic on
 * energy.
 */

// Explicit .ts specifiers: this file is covered by node --test, whose ESM
// resolver needs them. tsconfig sets allowImportingTsExtensions for exactly
// this, and Metro resolves the exact path.
import { kjToKcal } from "../../utils/energy.ts";
import { formatServing, toFoodCardVM } from "../addFood/addFoodApi.mappers.ts";
import type { CatalogFoodHit, FoodCardVM } from "../addFood/addFoodApi.types";
import type {
  BarcodeHit,
  BarcodeReportForm,
  BarcodeReportMissing,
  BarcodeReportPayload,
  BarcodeServing,
  LoggableScannedFood,
} from "./barcodeApi.types";

/** Longest code any scanner format produces, matching the backend's cap. */
export const MAX_BARCODE_LENGTH = 24;
export const MIN_BARCODE_LENGTH = 6;

/**
 * Digits only, same rule as the backend. A scanner hands back spaces and the
 * odd control character, and the cache key must not depend on which.
 */
export const normaliseBarcode = (raw: string | null | undefined): string =>
  String(raw ?? "").replace(/\D/g, "").slice(0, MAX_BARCODE_LENGTH);

/** The scanned product as the Design 3 card, same as a search result. */
export const toScannedCardVM = (hit: BarcodeHit): FoodCardVM =>
  toFoodCardVM({ ...hit, serving: hit.serving } as unknown as CatalogFoodHit);

/** Label for a serving chip. Reuses the search formatter so "250 mlper (250 ml)" reads the same everywhere. */
export const servingChipLabel = (serving: BarcodeServing): string => formatServing(serving.description);

/** Stable key for a chip: catalogue rows have an id, a live OFF answer does not. */
export const servingKey = (serving: BarcodeServing): string =>
  serving.id !== null && serving.id !== undefined
    ? String(serving.id)
    : String(serving.source_record_id ?? serving.description);

export const findServing = (hit: BarcodeHit, key: string | null | undefined): BarcodeServing => {
  if (!key) return hit.serving;
  return hit.servings.find((serving) => servingKey(serving) === key) ?? hit.serving;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Multiplying by a quantity is where float noise gets in: 1.1 x 3 is
 * 3.3000000000000003, and that is what would land in meal_logs.calories. Every
 * number this file computes goes through the same rounding the nutrients do,
 * so the column and the snapshot never disagree in the fourteenth decimal.
 */
const numberOrZero = (value: number | null | undefined, factor = 1) =>
  typeof value === "number" && Number.isFinite(value) ? round4(value * factor) : 0;

const scale = (value: number | null | undefined, factor: number): number | null =>
  value === null || value === undefined || !Number.isFinite(value) ? null : round4(value * factor);

/** Quantity as the stepper produces it: 0.5 steps, at least 0.5. */
export const normaliseQuantity = (quantity: number | null | undefined): number => {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0.5, Math.round(parsed * 2) / 2);
};

/** Energy of a choice, in kJ, for the live line under the stepper. */
export const energyKjFor = (serving: BarcodeServing, quantity: number): number | null => {
  const perServing = serving.nutrition?.energy_kj;
  if (perServing === null || perServing === undefined || !Number.isFinite(perServing)) return null;
  return Math.round(perServing * normaliseQuantity(quantity));
};

export type ScannedLogChoice = {
  /** From servingKey(); omitted means the default serving. */
  servingKey?: string | null;
  quantity?: number;
  mealType?: string;
};

/**
 * The object handed to onAddFood(). Unlike the search path this multiplies by
 * the chosen serving and quantity, because the picker offers both: logging
 * "2 × 1 biscuit" must not store one biscuit's numbers.
 */
export const toLoggableScannedFood = (
  hit: BarcodeHit,
  source: "catalog" | "openfoodfacts_live",
  choice: ScannedLogChoice = {},
): LoggableScannedFood => {
  const vm = toScannedCardVM(hit);
  const serving = findServing(hit, choice.servingKey);
  const quantity = normaliseQuantity(choice.quantity);
  const nutrition = serving.nutrition ?? hit.nutrition;
  const name = vm.tag.kind === "brand" ? `${vm.title} (${vm.tag.name})` : vm.title;

  return {
    title: name,
    calories: numberOrZero(nutrition.calories_kcal, quantity),
    protein: numberOrZero(nutrition.protein_g, quantity),
    carbs: numberOrZero(nutrition.carbohydrate_g, quantity),
    fats: numberOrZero(nutrition.fat_g, quantity),
    image: hit.image_url ?? "",
    externalId: hit.public_id,
    source,
    servingId: servingKey(serving),
    servingDescription: servingChipLabel(serving),
    servings: quantity,
    barcode: hit.barcode,
    nutrients: {
      energy_kj: scale(nutrition.energy_kj, quantity),
      calories_kcal: scale(nutrition.calories_kcal, quantity),
      protein_g: scale(nutrition.protein_g, quantity),
      fat_g: scale(nutrition.fat_g, quantity),
      carbohydrate_g: scale(nutrition.carbohydrate_g, quantity),
      fiber_g: scale(nutrition.fiber_g, quantity),
      sugar_g: scale(nutrition.sugar_g, quantity),
      sodium_mg: scale(nutrition.sodium_mg, quantity),
      vitamin_a_mcg: scale(nutrition.vitamin_a_mcg, quantity),
      vitamin_a_convention: nutrition.vitamin_a_convention ?? null,
      serving_grams: serving.grams_equivalent ?? null,
    },
  };
};

// ---------------------------------------------------------------------------
// The report form
// ---------------------------------------------------------------------------

export const emptyReportForm = (): BarcodeReportForm => ({
  productName: "",
  brand: "",
  servingSize: "",
  servingUnit: "g",
  energyKj: "",
  proteinG: "",
  carbohydrateG: "",
  fatG: "",
  photoUrl: null,
});

/** "12,5" and " 12.50 " both mean 12.5; anything else is not a number. */
const parseDecimal = (text: string): number | null => {
  const cleaned = String(text ?? "").replace(",", ".").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
};

/**
 * Which starred fields are still missing. Send stays disabled while this is
 * non-empty: an empty report is worse than no report (checklist b0-08).
 */
export const missingReportFields = (form: BarcodeReportForm): BarcodeReportMissing => {
  const missing: BarcodeReportMissing = [];
  if (!String(form.productName ?? "").trim()) missing.push("productName");
  const serving = parseDecimal(form.servingSize);
  if (serving === null || Number.isNaN(serving) || serving <= 0) missing.push("servingSize");
  const energy = parseDecimal(form.energyKj);
  if (energy === null || Number.isNaN(energy) || energy < 0) missing.push("energyKj");
  return missing;
};

export const isReportSendable = (form: BarcodeReportForm): boolean => missingReportFields(form).length === 0;

/** True when the user has typed anything, so "Scan again" knows to ask first. */
export const isReportDirty = (form: BarcodeReportForm): boolean => {
  const empty = emptyReportForm();
  return (Object.keys(empty) as (keyof BarcodeReportForm)[]).some((key) => {
    if (key === "servingUnit") return form.servingUnit !== empty.servingUnit;
    return String(form[key] ?? "") !== String(empty[key] ?? "");
  });
};

const optionalNumber = (text: string): number | null => {
  const value = parseDecimal(text);
  return value === null || Number.isNaN(value) ? null : value;
};

/**
 * The one serving a reported food has: the size and energy the user typed.
 *
 * Built as a real BarcodeServing so MealServingPicker needs no branch for this
 * path. The numbers are per serving, as printed, which is exactly what the
 * picker multiplies.
 */
export const reportServing = (form: BarcodeReportForm): BarcodeServing => {
  const grams = optionalNumber(form.servingSize);
  const energyKj = optionalNumber(form.energyKj);
  const unit = form.servingUnit === "ml" ? "ml" : "g";

  return {
    id: null,
    source_record_id: "report:label",
    description: grams === null ? "1 serving" : `${grams} ${unit}`,
    grams_equivalent: unit === "g" ? grams : null,
    metric_amount: grams,
    metric_unit: unit,
    is_default: true,
    nutrition: {
      energy_kj: energyKj,
      calories_kcal: energyKj === null ? null : round4(kjToKcal(energyKj)),
      protein_g: optionalNumber(form.proteinG),
      fat_g: optionalNumber(form.fatG),
      carbohydrate_g: optionalNumber(form.carbohydrateG),
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
      vitamin_a_mcg: null,
      vitamin_a_convention: null,
    },
  };
};

/**
 * How many failed reports are kept waiting for the next send. Small on purpose:
 * this is a courtesy retry, not an outbox. A report is OURS to lose, not the
 * user's, so it is never persisted and never mentioned to them (checklist
 * b5-05).
 */
export const MAX_QUEUED_REPORTS = 10;

/**
 * Add a report to the retry queue.
 *
 * A second report for the same barcode REPLACES the first: the server upserts
 * on (barcode, reporter) anyway, so keeping both would mean sending the stale
 * one after the fresh one. Over the cap, the oldest goes.
 */
export const queueReport = (
  queue: BarcodeReportPayload[],
  payload: BarcodeReportPayload,
): BarcodeReportPayload[] => {
  const kept = queue.filter((item) => item.barcode !== payload.barcode);
  kept.push(payload);
  return kept.slice(-MAX_QUEUED_REPORTS);
};

export const buildReportPayload = (
  form: BarcodeReportForm,
  context: { barcode: string; barcodeType?: string | null; appVersion?: string | null },
): BarcodeReportPayload => ({
  barcode: context.barcode,
  barcodeType: context.barcodeType ?? null,
  productName: String(form.productName).replace(/\s+/g, " ").trim(),
  brand: String(form.brand ?? "").trim() || null,
  servingSize: Number(parseDecimal(form.servingSize)),
  servingUnit: form.servingUnit === "ml" ? "ml" : "g",
  energyKj: Number(parseDecimal(form.energyKj)),
  proteinG: optionalNumber(form.proteinG),
  carbohydrateG: optionalNumber(form.carbohydrateG),
  fatG: optionalNumber(form.fatG),
  photoUrl: form.photoUrl ?? null,
  appVersion: context.appVersion ?? null,
});

/**
 * The meal-log entry for a food the user described themselves. The numbers are
 * theirs, so `source` says `user_report` rather than claiming the catalogue
 * knew this product: the log should not be more confident than we are.
 */
export const toLoggableReportedFood = (
  form: BarcodeReportForm,
  context: { barcode: string; quantity?: number },
): LoggableScannedFood => {
  const quantity = normaliseQuantity(context.quantity);
  const energyKj = Number(parseDecimal(form.energyKj)) || 0;
  const perServingKcal = kjToKcal(energyKj);
  const grams = Number(parseDecimal(form.servingSize)) || null;
  const brand = String(form.brand ?? "").trim();
  const name = String(form.productName).replace(/\s+/g, " ").trim();

  return {
    title: brand ? `${name} (${brand})` : name,
    calories: round4(perServingKcal * quantity),
    protein: numberOrZero(optionalNumber(form.proteinG), quantity),
    carbs: numberOrZero(optionalNumber(form.carbohydrateG), quantity),
    fats: numberOrZero(optionalNumber(form.fatG), quantity),
    image: "",
    externalId: `barcode_${context.barcode}`,
    source: "user_report",
    servingId: `report:${context.barcode}`,
    servingDescription: grams ? `${grams} ${form.servingUnit}` : "1 serving",
    servings: quantity,
    barcode: context.barcode,
    nutrients: {
      energy_kj: scale(energyKj, quantity),
      calories_kcal: scale(perServingKcal, quantity),
      protein_g: scale(optionalNumber(form.proteinG), quantity),
      fat_g: scale(optionalNumber(form.fatG), quantity),
      carbohydrate_g: scale(optionalNumber(form.carbohydrateG), quantity),
      fiber_g: null,
      sugar_g: null,
      sodium_mg: null,
      vitamin_a_mcg: null,
      vitamin_a_convention: null,
      serving_grams: form.servingUnit === "g" ? grams : null,
    },
  };
};
