/**
 * Plates on the planning screen: saving one writes one row per food, and
 * anything else saves exactly as before. Throwaway sprint test (m7-06).
 *
 *   node --experimental-strip-types --test utils/plateLog.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { isPlate, isSnackPlate, logEntriesFor, plateFoodLine, plateLabel, platePhotos } from "./plateLog.ts";

const plate = {
  id: "plate_dinner_1",
  type: "plate",
  source: "catalog_plate",
  title: "Salmon, brown rice & broccolini",
  calories: 812,
  items: [
    { id: "food_a", externalId: "food_a", title: "Salmon", food_name: "Salmon, baked, no added fat", role: "main",
      calories: 343, protein: 30.1, carbs: 0, fats: 25.1, grams: 132, image: "https://img/salmon.webp",
      serving_description: "1 × 1 fillet, medium (132 g)", nutrients: { energy_kj: 1436, protein_g: 30.1, vitamin_c_mg: null, alcohol_g: 0 } },
    { id: "food_b", externalId: "food_b", title: "Brown rice", food_name: "Rice, brown, cooked", role: "side",
      calories: 416, protein: 10.4, carbs: 84.2, fats: 2.7, grams: 251.3, image: "https://img/rice.webp",
      serving_description: "1½ × 1 cup (250 ml)", nutrients: { energy_kj: 1741 } },
    { id: "food_c", externalId: "food_c", title: "Broccolini", food_name: "Broccolini, steamed", role: "side",
      calories: 53, protein: 5.7, carbs: 3.6, fats: 0.7, grams: 173, image: "",
      serving_description: "1 × 1 bunch (173 g)", nutrients: { energy_kj: 220 } },
  ],
};

const legacy = (item: any) => ({
  foodName: item.title, calories: item.calories, protein: 0, carbs: 0, fats: 0, image: "", externalId: item.id,
  source: item.source, servingId: "", servingDescription: "", nutrients: { legacy: true },
});

test("a plate is recognised; single foods and recipes are not", () => {
  assert.equal(isPlate(plate), true);
  assert.equal(isPlate({ type: "food", title: "Apple" }), false);
  assert.equal(isPlate({ type: "plate", items: [] }), false);
  assert.equal(isPlate(null), false);
});

test("saving a plate writes one row per food, main first", () => {
  const rows = logEntriesFor(plate, legacy);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.foodName), ["Salmon, baked, no added fat", "Rice, brown, cooked", "Broccolini, steamed"]);
  assert.ok(rows.every((r) => r.source === "catalog"));
  assert.equal(rows[1].servingDescription, "1½ × 1 cup (250 ml)");
  assert.equal(rows.reduce((s, r) => s + r.calories, 0), 812);
});

test("each row keeps the food's catalogue nutrition, unknown as null, plus its grams", () => {
  const [salmon] = logEntriesFor(plate, legacy);
  assert.equal(salmon.externalId, "food_a");
  assert.equal(salmon.nutrients.protein_g, 30.1);
  assert.equal(salmon.nutrients.vitamin_c_mg, null);
  assert.equal(salmon.nutrients.alcohol_g, 0);
  assert.equal(salmon.nutrients.serving_grams, 132);
});

test("anything that is not a plate saves exactly as before", () => {
  const rows = logEntriesFor({ id: "x", title: "Apple", calories: 80, source: "fatsecret_food" }, legacy);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].nutrients, { legacy: true });
});

test("card text: label, food line with grams, and photos without blanks", () => {
  assert.equal(plateLabel(plate), "PLATE · 3 FOODS");
  assert.equal(plateFoodLine(plate), "Salmon 132 g · Brown rice 251 g · Broccolini 173 g");
  assert.deepEqual(platePhotos(plate), ["https://img/salmon.webp", "https://img/rice.webp"]);
});

// ---- A1, 2026-11-20: snack and dish cards ---------------------------------

const snackPlate = {
  id: "plate_snack_1",
  type: "plate",
  source: "catalog_plate",
  mealType: "snack",
  shape: "snack",
  title: "Apple & cheddar",
  calories: 172,
  items: [
    { id: "food_apple", externalId: "food_apple", title: "Apple", food_name: "Apple, fuji, raw", role: "main",
      calories: 88, protein: 0.4, carbs: 20, fats: 0.2, grams: 150, image: "https://img/apple.webp",
      serving_description: "1 × 1 apple (150 g)", nutrients: { energy_kj: 368, alcohol_g: 0 } },
    { id: "food_cheddar", externalId: "food_cheddar", title: "Cheddar", food_name: "Cheese, cheddar, regular fat", role: "side",
      calories: 84, protein: 5.3, carbs: 0, fats: 7, grams: 21, image: "https://img/cheddar.webp",
      serving_description: "1 × 1 slice (21 g)", nutrients: { energy_kj: 351, calcium_mg: null } },
  ],
};

test("a snack plate is labelled SNACK and logs one row per food, like any plate", () => {
  assert.equal(isSnackPlate(snackPlate), true);
  assert.equal(isSnackPlate(plate), false);
  assert.equal(plateLabel(snackPlate), "SNACK · 2 FOODS");
  assert.equal(plateLabel({ ...snackPlate, items: [snackPlate.items[0]] }), "SNACK");
  const rows = logEntriesFor(snackPlate, legacy);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.source === "catalog"));
  assert.equal(rows[1].nutrients.calcium_mg, null);
  assert.equal(rows[0].nutrients.serving_grams, 150);
});

test("a whole dish alone is labelled DISH; a whole dish with a side stays a plate", () => {
  const burger = { ...plate, shape: "whole", items: [plate.items[0]] };
  assert.equal(plateLabel(burger), "DISH");
  assert.equal(plateLabel({ ...plate, shape: "whole", items: plate.items.slice(0, 2) }), "PLATE · 2 FOODS");
});
