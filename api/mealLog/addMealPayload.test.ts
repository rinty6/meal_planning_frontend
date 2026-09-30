// The contract six screens used to keep six copies of.
// Run: npm test  (node --experimental-strip-types --test)

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AddMealPayloadError,
  UNKNOWN_FOOD_NAME,
  buildAddMealBody,
  scaleToTotals,
  type AddMealInput,
} from "./addMealPayload.ts";

const base = (overrides: Partial<AddMealInput> = {}): AddMealInput => ({
  clerkId: "user_123",
  date: "2026-09-30",
  mealType: "dinner",
  foodName: "Coke Zero",
  calories: 4,
  protein: 0,
  carbs: 0,
  fats: 0,
  ...overrides,
});

test("the happy path carries every field the backend destructures", () => {
  const body = buildAddMealBody(base({
    servings: 2,
    image: "https://example.test/a.webp",
    externalId: "food_1",
    source: "catalog",
    servingId: "s1",
    servingDescription: "1 bottle",
    nutrients: { fibre: 2 },
  }));
  assert.deepEqual(body, {
    clerkId: "user_123",
    date: "2026-09-30",
    mealType: "dinner",
    foodName: "Coke Zero",
    calories: 4,
    protein: 0,
    carbs: 0,
    fats: 0,
    servings: 2,
    image: "https://example.test/a.webp",
    externalId: "food_1",
    source: "catalog",
    servingId: "s1",
    servingDescription: "1 bottle",
    nutrients: { fibre: 2 },
  });
});

// --- the two bugs this file exists to prevent -------------------------------

test("mealType is required, because inferring it put a dinner scan in breakfast", () => {
  assert.throws(() => buildAddMealBody(base({ mealType: "" })), AddMealPayloadError);
  assert.throws(() => buildAddMealBody(base({ mealType: undefined as never })), /never inferred/);
});

test("servings defaults to 1 and survives, because Home dropped it (Error 061)", () => {
  assert.equal(buildAddMealBody(base()).servings, 1);
  assert.equal(buildAddMealBody(base({ servings: 2 })).servings, 2);
  // A 2-bottle Coke Zero: 8 kcal total AND servings 2. Storing 8 against
  // servings 1 is the exact bug the device pass found.
  const body = buildAddMealBody(base({ ...scaleToTotals({ calories: 4, protein: 0, carbs: 0, fats: 0 }, 2) }));
  assert.equal(body.calories, 8);
  assert.equal(body.servings, 2);
});

test("a zero or negative servings count is 1, matching the backend", () => {
  assert.equal(buildAddMealBody(base({ servings: 0 })).servings, 1);
  assert.equal(buildAddMealBody(base({ servings: -3 })).servings, 1);
});

// --- scaling ----------------------------------------------------------------

test("scaleToTotals multiplies every macro by the same quantity", () => {
  assert.deepEqual(scaleToTotals({ calories: 100, protein: 10, carbs: 20, fats: 5 }, 2.5),
    { calories: 250, protein: 25, carbs: 50, fats: 12.5, servings: 2.5 });
});

test("scaleToTotals rounds, so 470/4.184 cannot reach meal_logs in full", () => {
  assert.equal(scaleToTotals({ calories: 470 / 4.184, protein: 0, carbs: 0, fats: 0 }, 1).calories, 112.33);
});

test("buildAddMealBody rounds too, for callers that scaled their own numbers", () => {
  assert.equal(buildAddMealBody(base({ calories: 112.33269598470363 })).calories, 112.33);
});

// --- coercion ---------------------------------------------------------------

test("numeric strings are numbers, and nonsense is zero not NaN", () => {
  const body = buildAddMealBody(base({ calories: "250.5", protein: "abc", carbs: null, fats: undefined }));
  assert.equal(body.calories, 250.5);
  assert.equal(body.protein, 0);
  assert.equal(body.carbs, 0);
  assert.equal(body.fats, 0);
});

test("empty strings become undefined, since the backend stores NULL for both", () => {
  const body = buildAddMealBody(base({ externalId: "", source: "   ", servingId: null, image: "" }));
  assert.equal(body.externalId, undefined);
  assert.equal(body.source, undefined);
  assert.equal(body.servingId, undefined);
  // image is the exception: the column is NOT NULL with an empty-string default.
  assert.equal(body.image, "");
});

test("a numeric externalId becomes a string", () => {
  assert.equal(buildAddMealBody(base({ externalId: 12345 })).externalId, "12345");
});

test("nutrients is always an object", () => {
  assert.deepEqual(buildAddMealBody(base()).nutrients, {});
  assert.deepEqual(buildAddMealBody(base({ nutrients: null })).nutrients, {});
  assert.deepEqual(buildAddMealBody(base({ nutrients: { iron: 1 } })).nutrients, { iron: 1 });
});

test("a blank food name falls back once, in one place", () => {
  assert.equal(buildAddMealBody(base({ foodName: "  " })).foodName, UNKNOWN_FOOD_NAME);
  assert.equal(buildAddMealBody(base({ foodName: "  Speck " })).foodName, "Speck");
});

// --- the guards -------------------------------------------------------------

test("the date must be YYYY-MM-DD, which the backend 400s on", () => {
  assert.throws(() => buildAddMealBody(base({ date: "30/09/2026" })), /YYYY-MM-DD/);
  // The trap this catches: toISOString() on a local date shifts the day either
  // side of midnight, and it does not match the shape either.
  assert.throws(() => buildAddMealBody(base({ date: "2026-09-30T14:00:00.000Z" })), /YYYY-MM-DD/);
});

test("a missing clerkId throws rather than posting an anonymous row", () => {
  assert.throws(() => buildAddMealBody(base({ clerkId: "" })), /Not signed in/);
});

test("the error names the field, so a failure report is actionable", () => {
  try {
    buildAddMealBody(base({ mealType: "" }));
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof AddMealPayloadError);
    assert.equal((err as AddMealPayloadError).field, "mealType");
  }
});
