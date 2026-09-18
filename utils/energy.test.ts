// Run: npm test  (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";

import { energyValue, formatEnergy, kcalToKj, kjToKcal, parseEnergyInput } from "./energy.ts";

test("constant and round trips", () => {
  assert.equal(kcalToKj(1), 4.184);
  assert.equal(Math.round(kjToKcal(8700)), 2079);
  // The daily-goal round trip from checklist p8-04: 8,700 kJ typed → stored → shown.
  const storedKcal = Math.round(parseEnergyInput("8,700")!);
  assert.equal(storedKcal, 2079);
  assert.equal(formatEnergy(storedKcal), "8,699 kJ");
});

test("formatEnergy defaults to kJ with a thousands separator", () => {
  assert.equal(formatEnergy(2000), "8,368 kJ");
  assert.equal(formatEnergy(50.47), "211 kJ");
  assert.equal(formatEnergy(0), "0 kJ");
  assert.equal(formatEnergy(2000, { withUnit: false }), "8,368");
  assert.equal(formatEnergy(2000, { unit: "kcal" }), "2,000 kcal");
  assert.equal(formatEnergy(1234567), "5,165,428 kJ");
});

test("unknown energy renders a placeholder, never 0", () => {
  assert.equal(formatEnergy(null), "–", "Number(null) is 0; null must not render as 0 kJ");
  assert.equal(formatEnergy(undefined), "–");
  assert.equal(formatEnergy(Number.NaN), "–");
  assert.equal(formatEnergy(null, { placeholder: "?" }), "?");
  assert.equal(energyValue(null), null);
});

test("negative energy is clamped to zero on screen", () => {
  assert.equal(formatEnergy(-5), "0 kJ");
});

test("parseEnergyInput reads the display unit and returns kcal", () => {
  assert.equal(parseEnergyInput("418.4"), 100);
  assert.equal(parseEnergyInput("8 700 kJ"), Math.round((8700 / 4.184) * 100) / 100);
  assert.equal(parseEnergyInput("2000", "kcal"), 2000);
  assert.equal(parseEnergyInput(""), null);
  assert.equal(parseEnergyInput("abc"), null);
  assert.equal(parseEnergyInput("-10"), null);
});
