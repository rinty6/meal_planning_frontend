// The water row's numbers (checklist m6-02, WATER_TOTAL_DESIGN.html).
// Throwaway sprint test (checklist m7-06).
import test from "node:test";
import assert from "node:assert/strict";

import { formatLitres, isWaterTargetReached, waterProgress } from "./waterFormat.ts";

test("litres: at most two decimals, no trailing zeros", () => {
  assert.equal(formatLitres(1250), "1.25 L");
  assert.equal(formatLitres(1500), "1.5 L");
  assert.equal(formatLitres(2000), "2 L");
  assert.equal(formatLitres(2600), "2.6 L");
  assert.equal(formatLitres(0), "0 L");
  assert.equal(formatLitres(undefined), "0 L");
});

test("the bar fills to the target and never past it", () => {
  assert.equal(waterProgress(1300, 2600), 0.5);
  assert.equal(waterProgress(3000, 2600), 1);
  assert.equal(waterProgress(500, 0), 0);
});

test("reached at the target, not before, and never without one", () => {
  assert.equal(isWaterTargetReached(2600, 2600), true);
  assert.equal(isWaterTargetReached(2550, 2600), false);
  assert.equal(isWaterTargetReached(500, 0), false);
});
