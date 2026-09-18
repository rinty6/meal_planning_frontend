// Title rule, chips, serving normalisation and the logged-food payload, on the
// real rows the 2026-09-17 design session pulled from Neon.
// Run: npm test  (node --experimental-strip-types --test)

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTitleAndChips, formatGrams, formatServing, splitQualifier, toFoodCardVM, toLoggableFood } from "./addFoodApi.mappers.ts";
import type { CatalogFoodHit } from "./addFoodApi.types.ts";

type HitOverrides = Partial<Omit<CatalogFoodHit, "serving" | "nutrition">> & {
  serving?: Partial<CatalogFoodHit["serving"]>;
  nutrition?: Partial<CatalogFoodHit["nutrition"]>;
};

const hit = (overrides: HitOverrides): CatalogFoodHit => ({
  public_id: "food_test",
  title: "Chicken, breast, lean, raw",
  base_name: "chicken",
  name_segments: ["breast", "lean", "raw"],
  brand: null,
  food_type: "generic",
  source_name: "ausnut_2023",
  source_derivation: "analysed",
  image_url: null,
  ...overrides,
  serving: { id: 1, description: "1 tenderloin (51.25 g)", grams_equivalent: 51.25, metric_amount: 51.25, metric_unit: "g", ...overrides.serving },
  nutrition: {
    energy_kj: 211.15, calories_kcal: 50.47, protein_g: 11.5312, fat_g: 0.41, carbohydrate_g: 0, fiber_g: 0, sugar_g: 0,
    sodium_mg: 30, vitamin_a_mcg: 5, vitamin_a_convention: "re", ...overrides.nutrition,
  },
});

test("generic AUSNUT row: base + first segment as title, rest as chips", () => {
  assert.deepEqual(buildTitleAndChips(hit({})), { title: "Chicken, breast", chips: ["lean", "raw"] });
});

test("bracketed qualifier in the first segment becomes the first chip", () => {
  const beer = hit({
    title: "Beer, full strength (alcohol 4-4.9% v/v), low carbohydrate",
    base_name: "beer",
    name_segments: ["full strength (alcohol 4-4.9% v/v)", "low carbohydrate"],
  });
  assert.deepEqual(buildTitleAndChips(beer), { title: "Beer, full strength", chips: ["alcohol 4-4.9% v/v", "low carbohydrate"] });
  assert.deepEqual(splitQualifier("light (alcohol 1- <2.9% v/v)"), { head: "light", qualifier: "alcohol 1- <2.9% v/v" });
  assert.deepEqual(splitQualifier("raw"), { head: "raw", qualifier: null });
});

test("branded row keeps its name, brand becomes the tag, no chips", () => {
  const vm = toFoodCardVM(hit({ title: "Zero Beer", base_name: "zero beer", name_segments: [], brand: "James Squire", food_type: "branded", source_name: "openfoodfacts", source_derivation: "label_data" }));
  assert.equal(vm.title, "Zero Beer");
  assert.deepEqual(vm.tag, { kind: "brand", name: "James Squire" });
  assert.deepEqual(vm.chips, []);
});

test("branded row without a brand name shows no tag", () => {
  const vm = toFoodCardVM(hit({ title: "Creamy tomato chiken fettuccine", base_name: null, name_segments: [], brand: null, food_type: "branded" }));
  assert.equal(vm.title, "Creamy tomato chiken fettuccine");
  assert.deepEqual(vm.tag, { kind: "none" });
});

test("generic row with no segments falls back to the capitalised base name", () => {
  const vm = toFoodCardVM(hit({ title: "Vegemite", base_name: "vegemite", name_segments: [] }));
  assert.equal(vm.title, "Vegemite");
  assert.deepEqual(vm.tag, { kind: "generic" });
});

test("formatServing collapses Open Food Facts repeats but keeps household measures", () => {
  assert.equal(formatServing("250 mlper (250 ml)"), "250 ml");
  assert.equal(formatServing("250 ml (250 ml)"), "250 ml");
  assert.equal(formatServing("1 thigh, large (174 g)"), "1 thigh, large (174 g)");
  assert.equal(formatServing("0.333 cup (30 g)"), "0.333 cup (30 g)");
  assert.equal(formatServing("100 g"), "100 g");
  assert.equal(formatServing("   "), "1 serving");
  assert.equal(formatServing(null), "1 serving");
});

test("formatGrams", () => {
  assert.equal(formatGrams(0), "0g");
  assert.equal(formatGrams(11.5312), "11.5g");
  assert.equal(formatGrams(21.4), "21.4g");
  assert.equal(formatGrams(62.425), "62.4g");
  assert.equal(formatGrams(20), "20g");
  assert.equal(formatGrams(null), "–");
});

test("VM carries kcal (storage unit) and the raw hit", () => {
  const vm = toFoodCardVM(hit({}));
  assert.equal(vm.key, "food_test");
  assert.equal(vm.energyKcal, 50.47);
  assert.equal(vm.proteinG, 11.5312);
  assert.equal(vm.servingLabel, "1 tenderloin (51.25 g)");
  assert.equal(vm.hit.public_id, "food_test");
});

test("toLoggableFood maps 1:1 onto meal_logs columns, folds the brand into the name, keeps vitamin A convention", () => {
  const generic = toLoggableFood(toFoodCardVM(hit({})));
  assert.equal(generic.title, "Chicken, breast");
  assert.equal(generic.calories, 50.47);
  assert.equal(generic.protein, 11.5312);
  assert.equal(generic.carbs, 0);
  assert.equal(generic.fats, 0.41);
  assert.equal(generic.externalId, "food_test");
  assert.equal(generic.source, "catalog");
  assert.equal(generic.servingId, "1");
  assert.equal(generic.servingDescription, "1 tenderloin (51.25 g)");
  assert.equal(generic.servings, 1);
  assert.equal(generic.nutrients.vitamin_a_convention, "re");
  assert.equal(generic.nutrients.serving_grams, 51.25);
  assert.equal(generic.image, "");

  const branded = toLoggableFood(toFoodCardVM(hit({ title: "Tim Tam", brand: "Arnott's", food_type: "branded", name_segments: [], nutrition: { calories_kcal: null } })));
  assert.equal(branded.title, "Tim Tam (Arnott's)");
  assert.equal(branded.calories, 0, "unknown energy logs as 0, never NaN");
});
