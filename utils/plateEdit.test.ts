/**
 * Plate editing on the detail page. Values are the real catalogue figures for
 * salmon, brown rice and broccolini (checked 2026-11-19). Throwaway sprint
 * test (m7-06).
 *
 *   node --experimental-strip-types --test utils/plateEdit.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  canRemove,
  formatAmount,
  formatDi,
  gramsOf,
  initialPlate,
  isEdited,
  kcalOf,
  logRowsFor,
  nutritionPanel,
  nutrientsOf,
  plateNutrients,
  plateTitle,
  portionLabel,
  servingOptions,
  stepQuantity,
} from "./plateEdit.ts";

// per100g derived from the stored serving profiles.
const SALMON = {
  id: "food_salmon", externalId: "food_salmon", title: "Salmon", food_name: "Salmon, baked, no added fat", role: "main",
  image: "https://img/salmon.webp", grams: 132, quantity: 1,
  serving: { description: "1 fillet, medium (132 g)", grams: 132 },
  servings: [
    { description: "1 fillet, small (98 g)", grams: 98 },
    { description: "1 cutlet (132 g)", grams: 132, isDefault: true },
    { description: "1 fillet, medium (132 g)", grams: 132 },
    { description: "1 fillet, large (161 g)", grams: 161 },
  ],
  per100g: { energy_kj: 1088, calories_kcal: 260.08, protein_g: 22.8, fat_g: 19.02, saturated_fat_g: 4.32,
    carbohydrate_g: 0, sugar_g: 0, sodium_mg: 36, vitamin_c_mg: null },
};
const RICE = {
  id: "food_rice", externalId: "food_rice", title: "Brown rice", food_name: "Rice, brown, cooked", role: "side",
  quantity: 1.5, serving: { description: "1 cup (250 ml)", grams: 167.5 },
  servings: [{ description: "1 tablespoon (20 ml)", grams: 13.4, isDefault: true }, { description: "1 cup (250 ml)", grams: 167.5 }],
  per100g: { energy_kj: 693, calories_kcal: 165.6, protein_g: 4.12, fat_g: 1.07, saturated_fat_g: 0.24,
    carbohydrate_g: 33.49, sugar_g: 0.3, sodium_mg: 2.03, vitamin_c_mg: null },
};
const BROCCOLINI = {
  id: "food_broc", externalId: "food_broc", title: "Broccolini", food_name: "Broccolini, steamed", role: "side",
  quantity: 1, serving: { description: "1 bunch (173 g)", grams: 173 },
  servings: [{ description: "1 stalk (28 g)", grams: 28 }, { description: "1 bunch (173 g)", grams: 173, isDefault: true }],
  per100g: { energy_kj: 127, calories_kcal: 30.35, protein_g: 3.29, fat_g: 0.4, saturated_fat_g: 0,
    carbohydrate_g: 2.08, sugar_g: 1.39, sodium_mg: 16, vitamin_c_mg: 7 },
};
const plate = () => initialPlate([SALMON, RICE, BROCCOLINI]);

test("serving options: the food's own sizes plus 100 g, no duplicate grams, smallest first", () => {
  assert.deepEqual(servingOptions(RICE).map((o) => o.description), ["1 tablespoon (20 ml)", "100 g", "1 cup (250 ml)"]);
  // cutlet and medium fillet are both 132 g: shown once
  assert.equal(servingOptions(SALMON).filter((o) => o.grams === 132).length, 1);
});

test("portions start where the planner left them", () => {
  const [salmon, rice] = plate();
  assert.equal(gramsOf(salmon), 132);
  assert.equal(gramsOf(rice), 251.3);
  assert.equal(portionLabel(rice), "1½ × 1 cup (250 ml)");
});

test("quantity moves in half steps between 0.5 and 10", () => {
  assert.equal(stepQuantity(1, 1), 1.5);
  assert.equal(stepQuantity(1, -1), 0.5);
  assert.equal(stepQuantity(0.5, -1), 0.5);
  assert.equal(stepQuantity(10, 1), 10);
});

test("whole-plate energy matches the mockup (3,397 kJ)", () => {
  const n = plateNutrients(plate());
  assert.ok(Math.abs((n.energy_kj as number) - 3397) < 3, String(n.energy_kj));
});

test("changing rice from 1½ cups to 1 cup takes the plate to about 2,817 kJ", () => {
  const foods = plate();
  foods[1] = { ...foods[1], quantity: 1 };
  const n = plateNutrients(foods);
  assert.ok(Math.abs((n.energy_kj as number) - 2817) < 3, String(n.energy_kj));
  assert.equal(isEdited(foods, plate()), true);
});

test("switching serving size uses the new grams", () => {
  const foods = plate();
  const hundred = foods[1].options.find((o) => o.description === "100 g")!;
  foods[1] = { ...foods[1], serving: hundred, quantity: 1 };
  assert.equal(gramsOf(foods[1]), 100);
  assert.ok(Math.abs((nutrientsOf(foods[1]).energy_kj as number) - 693) < 0.01);
});

test("removing broccolini: totals drop it, the title follows, and it can come back", () => {
  const foods = plate();
  foods[2] = { ...foods[2], removed: true };
  assert.equal(plateTitle(foods), "Salmon & brown rice");
  assert.ok(Math.abs((plateNutrients(foods).energy_kj as number) - 3177) < 3);
  foods[2] = { ...foods[2], removed: false };
  assert.equal(plateTitle(foods), "Salmon, brown rice & broccolini");
  assert.equal(isEdited(foods, plate()), false);
});

test("the last food cannot be removed", () => {
  const foods = plate();
  foods[1] = { ...foods[1], removed: true };
  assert.equal(canRemove(foods), true);
  foods[2] = { ...foods[2], removed: true };
  assert.equal(canRemove(foods), false);
});

test("unknown stays unknown: plate vitamin C is broccolini's alone, and all-unknown shows –", () => {
  const foods = plate();
  assert.ok(Math.abs((plateNutrients(foods).vitamin_c_mg as number) - 12.11) < 0.01);
  foods[2] = { ...foods[2], removed: true };
  assert.equal(plateNutrients(foods).vitamin_c_mg, null);
  assert.equal(formatAmount(null, "mg"), "–");
  assert.equal(formatDi("sodium_mg", null), "–");
});

test("log rows: one per food left, with its portion, nutrients and grams", () => {
  const foods = plate();
  foods[2] = { ...foods[2], removed: true };
  const rows = logRowsFor(foods);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].foodName, "Salmon, baked, no added fat");
  assert.equal(rows[0].source, "catalog");
  assert.equal(rows[0].calories, 343);
  assert.equal(rows[1].servingDescription, "1½ × 1 cup (250 ml)");
  assert.equal(rows[1].nutrients.serving_grams, 251.3);
  assert.equal(rows[1].nutrients.vitamin_c_mg, null);
});

test("%DI uses the FSANZ values and only where Australia defines one", () => {
  assert.equal(formatDi("protein_g", 46.2), "92%");
  assert.equal(formatDi("energy_kj", 3397), "39%");
  assert.equal(formatDi("sugar_g", 3.2), "4%"); // 90 g reference
  assert.equal(formatDi("cholesterol_mg", 94), "");
});

test("the panel: 6 summary rows under energy, the rest behind Show more", () => {
  const panel = nutritionPanel(plateNutrients(plate()));
  assert.deepEqual(panel.summary.map((r) => r.label), ["Protein", "Fat, total", "saturated", "Carbohydrate", "sugars", "Sodium"]);
  assert.ok(panel.more.some((r) => r.label === "Vitamin C"));
  assert.equal(panel.energyDi, "39%");
  assert.ok(Math.round(kcalOf(plateNutrients(plate()))) >= 810);
});
