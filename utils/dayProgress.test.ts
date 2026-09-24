/**
 * The day strip's two rules: never draw a bar from a guess, and "over" means
 * past the band rather than past the number.
 *
 *   node --experimental-strip-types --test utils/dayProgress.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { dayProgressFromPayload, dayProgressView } from "./dayProgress.ts";

// 2,000 kcal is 8,368 kJ; 1,550 kcal is 6,485 kJ.
const payload = (over: Partial<Record<string, unknown>> = {}) => ({
  dailyTotalCalories: 1550,
  dailyTarget: 2000,
  mealTotalCalories: 512,
  ...over,
});

test("a complete payload becomes a strip", () => {
  const progress = dayProgressFromPayload(payload(), "dinner");
  assert.ok(progress);
  assert.equal(progress.consumedKcal, 1550);
  assert.equal(progress.targetKcal, 2000);
  assert.equal(progress.mealKcal, 512);
  assert.equal(progress.over, false);
});

test("no target means no strip", () => {
  assert.equal(dayProgressFromPayload(payload({ dailyTarget: 0 }), "dinner"), null);
  assert.equal(dayProgressFromPayload(payload({ dailyTarget: null }), "dinner"), null);
  assert.equal(
    dayProgressFromPayload(payload({ dailyTarget: undefined }), "dinner"),
    null,
    "a user with no goal set gets no bar rather than a bar against nothing",
  );
});

test("no daily total means no strip", () => {
  assert.equal(dayProgressFromPayload(payload({ dailyTotalCalories: null }), "dinner"), null);
  assert.equal(dayProgressFromPayload(null, "dinner"), null);
  assert.equal(dayProgressFromPayload("nope", "dinner"), null);
});

test("an older backend without the meal subtotal still gets the day line", () => {
  const progress = dayProgressFromPayload(payload({ mealTotalCalories: undefined }), "dinner");
  assert.ok(progress);
  assert.equal(progress.mealKcal, null);
  assert.equal(dayProgressView(progress).left, "", "no subtotal, no meal label invented");
  assert.match(dayProgressView(progress).right, /^Today /);
});

test("the strip reads in kJ, with the meal named", () => {
  const view = dayProgressView(dayProgressFromPayload(payload(), "dinner")!);
  assert.equal(view.left, "Dinner 2,142 kJ");
  assert.equal(view.right, "Today 6,485 / 8,368 kJ");
  assert.equal(view.fillPercent, 78);
});

test("the fill clamps at 100 while the label tells the truth", () => {
  const progress = dayProgressFromPayload(payload({ dailyTotalCalories: 2600 }), "dinner", { over: true });
  const view = dayProgressView(progress!);
  assert.equal(view.fillPercent, 100, "a bar cannot be 130% full");
  assert.equal(view.right, "2,510 kJ over", "600 kcal past 2,000");
  assert.equal(view.over, true);
});

test("inside the tolerance band the strip is not 'over'", () => {
  // 2,100 of 2,000 is past the number but inside the 10% band, so the card's
  // copy says on target. The strip must not contradict it (ERROR 074).
  const progress = dayProgressFromPayload(payload({ dailyTotalCalories: 2100 }), "dinner", { over: false });
  const view = dayProgressView(progress!);
  assert.equal(view.over, false);
  assert.equal(view.fillPercent, 100);
  assert.equal(view.right, "Today 8,786 / 8,368 kJ", "the literal total is still on screen");
});
