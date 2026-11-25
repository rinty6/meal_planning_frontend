// Coverage for the planning screen's wording of plan_notes (2026-11-25,
// PLAN_STATES_DESIGN.html). Throwaway sprint test (checklist m7-06).
import test from "node:test";
import assert from "node:assert/strict";

import { adjustedHintText, emptyStateText, formatServes, readPlanNotes, serveChipText, serveSheet, type PlanNote } from "./planNotes.ts";

const GRAIN: PlanNote = { code: "serve_target_out_of_reach", group: "grain", target: 8.5, best: 7.2 };
const DAIRY: PlanNote = { code: "serve_target_out_of_reach", group: "dairy", target: 4, best: 2.7 };

test("serves round to the half serve", () => {
  assert.equal(formatServes(7.2), "7");
  assert.equal(formatServes(8.5), "8½");
  assert.equal(formatServes(2.7), "2½");
  assert.equal(formatServes(0.4), "½");
  assert.equal(formatServes(0.1), "0");
});

test("no notes: nothing extra on screen", () => {
  assert.equal(serveChipText([]), null);
  assert.equal(serveSheet([]), null);
  assert.equal(emptyStateText([]), "No ideas fit your filters");
  assert.equal(adjustedHintText([]), "Planned around what you've logged today");
});

test("one food group short: a named chip and a two-number sheet", () => {
  assert.equal(serveChipText([GRAIN]), "Grains short today");
  const sheet = serveSheet([GRAIN]);
  assert.equal(sheet?.title, "Grains are short today");
  assert.deepEqual(sheet?.lines, [
    "Even the most filling ideas reach about 7 of your 8½ grain serves. A wholegrain snack or an extra slice of bread closes the gap.",
  ]);
});

test("two groups short: a counted chip and one line each", () => {
  assert.equal(serveChipText([GRAIN, DAIRY]), "2 food groups short today");
  const sheet = serveSheet([GRAIN, DAIRY]);
  assert.equal(sheet?.title, "2 food groups are short today");
  assert.equal(sheet?.lines.length, 2);
  assert.match(sheet!.lines[1], /2½ of your 4 dairy serves/);
});

test("the other notes change one line each", () => {
  assert.equal(emptyStateText([{ code: "unknown_preference", labels: ["Sesame"] }]), "One filter isn't supported yet");
  assert.equal(adjustedHintText([{ code: "day_over_energy" }]), "Lighter ideas, today is nearly at your target");
});

test("payloads without notes, or with odd entries, are safe", () => {
  assert.deepEqual(readPlanNotes({}), []);
  assert.deepEqual(readPlanNotes({ plan_notes: [null, { nope: 1 }, { code: "day_over_energy" }] }), [{ code: "day_over_energy" }]);
  assert.equal(serveChipText([{ code: "serve_target_out_of_reach", group: "sodium", target: 1, best: 0 } as PlanNote]), null);
});
