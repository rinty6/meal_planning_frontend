/**
 * Barcode mappers: the serving choice, the quantity, and the report form.
 * Pure functions, no network.
 *
 *   node --experimental-strip-types --test api/barcode/barcodeApi.test.ts
 *
 * The rules under test are the ones that decide what number lands in
 * meal_logs, so they are written as "2 × 1 biscuit is not 1 biscuit" rather
 * than as shape assertions.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReportPayload,
  emptyReportForm,
  energyKjFor,
  findServing,
  isReportDirty,
  isReportSendable,
  missingReportFields,
  normaliseQuantity,
  servingChipLabel,
  servingKey,
  toLoggableReportedFood,
  toLoggableScannedFood,
  toScannedCardVM,
  normaliseBarcode,
} from "./barcodeApi.mappers.ts";
import type { BarcodeHit, BarcodeReportForm, BarcodeServing } from "./barcodeApi.types.ts";

const nutrition = (energyKj: number, protein: number) => ({
  energy_kj: energyKj,
  calories_kcal: Math.round((energyKj / 4.184) * 10000) / 10000,
  protein_g: protein,
  fat_g: 4.9,
  carbohydrate_g: 12,
  fiber_g: 0.4,
  sugar_g: 8.1,
  sodium_mg: 30,
  vitamin_a_mcg: null,
  vitamin_a_convention: null,
});

const pack: BarcodeServing = {
  id: 501,
  description: "1 biscuit (18.3 g)",
  grams_equivalent: 18.3,
  metric_amount: 18.3,
  metric_unit: "g",
  is_default: true,
  nutrition: nutrition(401, 1),
};

const hundred: BarcodeServing = {
  id: 502,
  description: "100 g",
  grams_equivalent: 100,
  metric_amount: 100,
  metric_unit: "g",
  is_default: false,
  nutrition: nutrition(2192, 5.1),
};

const hit = (overrides: Partial<BarcodeHit> = {}): BarcodeHit => ({
  public_id: "food_off_9310072010816",
  title: "Tim Tam Original",
  base_name: "tim tam original",
  name_segments: [],
  brand: "Arnott's",
  food_type: "branded",
  source_name: "openfoodfacts",
  source_derivation: "label_data",
  image_url: null,
  barcode: "9310072010816",
  barcode_type: "EAN13",
  verification_status: "unverified",
  serving: pack,
  servings: [pack, hundred],
  nutrition: pack.nutrition,
  ...overrides,
});

// --- the code itself -------------------------------------------------------

test("a scanned code is reduced to digits", () => {
  assert.equal(normaliseBarcode(" 931-0072 010816 "), "9310072010816");
  assert.equal(normaliseBarcode(null), "");
  assert.equal(normaliseBarcode("1".repeat(40)).length, 24);
});

// --- the card --------------------------------------------------------------

test("a scanned product renders as the same card a search result does", () => {
  const vm = toScannedCardVM(hit());
  assert.equal(vm.title, "Tim Tam Original");
  assert.deepEqual(vm.tag, { kind: "brand", name: "Arnott's" });
  assert.equal(vm.servingLabel, "1 biscuit (18.3 g)");
  assert.equal(vm.energyKcal, pack.nutrition.calories_kcal);
});

// --- choosing a serving ----------------------------------------------------

test("serving keys survive both a catalogue row and a live OFF answer", () => {
  assert.equal(servingKey(pack), "501");
  assert.equal(servingKey({ ...pack, id: null, source_record_id: "label:serving" }), "label:serving");
  // Nothing to key on at all: the description is stable enough to pick a chip.
  assert.equal(servingKey({ ...pack, id: null, source_record_id: null }), "1 biscuit (18.3 g)");
});

test("an unknown or missing key falls back to the default serving", () => {
  assert.equal(findServing(hit(), null).id, 501);
  assert.equal(findServing(hit(), "999").id, 501);
  assert.equal(findServing(hit(), "502").id, 502);
});

test("the chip label goes through the same formatter search uses", () => {
  assert.equal(servingChipLabel(pack), "1 biscuit (18.3 g)");
  assert.equal(servingChipLabel({ ...pack, description: "250 mlper (250 ml)" }), "250 ml");
});

// --- quantity --------------------------------------------------------------

test("quantity snaps to half steps and never reaches zero", () => {
  assert.equal(normaliseQuantity(2), 2);
  assert.equal(normaliseQuantity(1.7), 1.5);
  assert.equal(normaliseQuantity(0), 0.5);
  assert.equal(normaliseQuantity(-3), 0.5);
  assert.equal(normaliseQuantity(undefined), 1);
  assert.equal(normaliseQuantity("abc" as unknown as number), 1);
});

test("the live kJ line follows the serving and the quantity", () => {
  assert.equal(energyKjFor(pack, 2), 802);
  assert.equal(energyKjFor(hundred, 1), 2192);
  assert.equal(energyKjFor({ ...pack, nutrition: { ...pack.nutrition, energy_kj: null } }, 2), null);
});

// --- what gets logged ------------------------------------------------------

test("two of a serving logs two of a serving, not one", () => {
  const one = toLoggableScannedFood(hit(), "catalog", { quantity: 1 });
  const two = toLoggableScannedFood(hit(), "catalog", { quantity: 2 });
  assert.equal(two.calories, one.calories * 2);
  assert.equal(two.protein, one.protein * 2);
  assert.equal(two.servings, 2);
  assert.equal(two.nutrients.energy_kj, 802);
});

test("choosing the 100 g chip logs the 100 g numbers", () => {
  const logged = toLoggableScannedFood(hit(), "catalog", { servingKey: "502", quantity: 1 });
  assert.equal(logged.servingDescription, "100 g");
  assert.equal(logged.nutrients.energy_kj, 2192);
  assert.equal(logged.calories, hundred.nutrition.calories_kcal);
  assert.equal(logged.servingId, "502");
});

test("the brand is folded into the logged name, as on the search path", () => {
  assert.equal(toLoggableScannedFood(hit(), "catalog").title, "Tim Tam Original (Arnott's)");
});

test("a live Open Food Facts answer is logged as such, not as the catalogue", () => {
  const logged = toLoggableScannedFood(hit(), "openfoodfacts_live");
  assert.equal(logged.source, "openfoodfacts_live");
  assert.equal(logged.barcode, "9310072010816");
});

test("an unknown nutrient stays unknown instead of becoming zero", () => {
  const sparse = hit({
    serving: { ...pack, nutrition: { ...pack.nutrition, sugar_g: null } },
    servings: [{ ...pack, nutrition: { ...pack.nutrition, sugar_g: null } }],
  });
  const logged = toLoggableScannedFood(sparse, "catalog", { quantity: 2 });
  assert.equal(logged.nutrients.sugar_g, null);
  assert.equal(logged.nutrients.protein_g, 2);
});

// --- the report form -------------------------------------------------------

const form = (overrides: Partial<BarcodeReportForm> = {}): BarcodeReportForm => ({
  ...emptyReportForm(),
  productName: "Rice Crackers",
  brand: "Want Want",
  servingSize: "30",
  energyKj: "470",
  proteinG: "3.3",
  carbohydrateG: "76.7",
  fatG: "16.7",
  ...overrides,
});

test("Send is blocked until the three starred fields are filled", () => {
  assert.deepEqual(missingReportFields(form()), []);
  assert.equal(isReportSendable(form()), true);

  assert.deepEqual(missingReportFields(emptyReportForm()), ["productName", "servingSize", "energyKj"]);
  assert.deepEqual(missingReportFields(form({ productName: "   " })), ["productName"]);
  assert.deepEqual(missingReportFields(form({ servingSize: "0" })), ["servingSize"]);
  assert.deepEqual(missingReportFields(form({ energyKj: "abc" })), ["energyKj"]);
  // An optional macro left blank must not block the send.
  assert.deepEqual(missingReportFields(form({ proteinG: "", fatG: "" })), []);
});

test("a decimal comma is a decimal point", () => {
  assert.equal(isReportSendable(form({ servingSize: "12,5" })), true);
  assert.equal(buildReportPayload(form({ servingSize: "12,5" }), { barcode: "1" }).servingSize, 12.5);
});

test("dirty means the user typed something, so Scan again knows to ask", () => {
  assert.equal(isReportDirty(emptyReportForm()), false);
  assert.equal(isReportDirty(form()), true);
  assert.equal(isReportDirty({ ...emptyReportForm(), servingUnit: "ml" }), true);
  assert.equal(isReportDirty({ ...emptyReportForm(), photoUrl: "https://res.cloudinary.com/x.jpg" }), true);
});

test("the payload carries numbers, not the strings the inputs hold", () => {
  const payload = buildReportPayload(form(), { barcode: "8991761230084", barcodeType: "EAN13", appVersion: "1.4.0" });
  assert.equal(payload.barcode, "8991761230084");
  assert.equal(payload.servingSize, 30);
  assert.equal(payload.energyKj, 470);
  assert.equal(payload.proteinG, 3.3);
  assert.equal(payload.servingUnit, "g");
  assert.equal(payload.appVersion, "1.4.0");
  assert.equal(typeof payload.energyKj, "number");
});

test("a blank optional field is sent as null, never as 0", () => {
  const payload = buildReportPayload(form({ proteinG: "", fatG: "  " }), { barcode: "1" });
  assert.equal(payload.proteinG, null);
  assert.equal(payload.fatG, null);
  assert.equal(payload.brand, "Want Want");
  assert.equal(buildReportPayload(form({ brand: "  " }), { barcode: "1" }).brand, null);
});

test("what the user typed in kJ is logged in kcal, converted once", () => {
  const logged = toLoggableReportedFood(form(), { barcode: "8991761230084", quantity: 1 });
  assert.equal(logged.nutrients.energy_kj, 470);
  assert.equal(logged.calories, Math.round((470 / 4.184) * 10000) / 10000);
  assert.equal(logged.title, "Rice Crackers (Want Want)");
  assert.equal(logged.servingDescription, "30 g");
});

test("a reported food says whose numbers they are", () => {
  const logged = toLoggableReportedFood(form(), { barcode: "8991761230084" });
  assert.equal(logged.source, "user_report", "the log must not claim the catalogue knew this product");
  assert.equal(logged.externalId, "barcode_8991761230084");
  assert.equal(logged.barcode, "8991761230084");
});

test("quantity scales a reported food too", () => {
  const two = toLoggableReportedFood(form(), { barcode: "1", quantity: 2 });
  assert.equal(two.nutrients.energy_kj, 940);
  assert.equal(two.protein, 6.6);
  assert.equal(two.servings, 2);
});

test("a millilitre serving stores no gram weight", () => {
  const ml = toLoggableReportedFood(form({ servingUnit: "ml", servingSize: "250" }), { barcode: "1" });
  assert.equal(ml.servingDescription, "250 ml");
  assert.equal(ml.nutrients.serving_grams, null, "250 ml is not 250 g");
});
