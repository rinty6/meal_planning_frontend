/**
 * What the planning screen says when the plan cannot do everything
 * (checklist m6-07 and the screen half of m5-06; PLAN_STATES_DESIGN.html,
 * approved 2026-11-25). The server works the cases out and sends them as
 * `plan_notes` (backend services/planNotes.js); this file only words them.
 * As little text as possible: one short line per state.
 *
 * Pure: no React, no network.
 */

export type PlanNote =
  | { code: "unknown_preference"; labels?: string[] }
  | { code: "few_ideas"; meal: string; shown: number; wanted: number }
  | { code: "day_over_energy" }
  | { code: "serve_target_out_of_reach"; group: string; target: number; best: number };

type ServeNote = Extract<PlanNote, { code: "serve_target_out_of_reach" }>;

const GROUPS: Record<string, { name: string; word: string; tip: string }> = {
  grain: { name: "Grains", word: "grain", tip: "A wholegrain snack or an extra slice of bread closes the gap." },
  vegetable: { name: "Vegetables", word: "vegetable", tip: "A side salad or an extra serve of vegetables closes the gap." },
  fruit: { name: "Fruit", word: "fruit", tip: "A piece of fruit closes the gap." },
  dairy: { name: "Dairy", word: "dairy", tip: "A glass of milk or a tub of yoghurt closes the gap." },
  protein: { name: "Protein foods", word: "protein", tip: "An egg or a small handful of nuts closes the gap." },
};

/** The notes in a payload, keeping only shapes this screen understands. */
export const readPlanNotes = (payload: any): PlanNote[] =>
  Array.isArray(payload?.plan_notes)
    ? payload.plan_notes.filter((n: any) => n && typeof n.code === "string")
    : [];

const serveNotes = (notes: PlanNote[]): ServeNote[] =>
  notes.filter((n): n is ServeNote => n.code === "serve_target_out_of_reach" && !!GROUPS[n.group]);

/** Serves rounded to the half serve: 7.2 -> "7", 8.5 -> "8½", 0.5 -> "½". */
export const formatServes = (value: number): string => {
  const half = Math.round((Number(value) || 0) * 2) / 2;
  const whole = Math.floor(half);
  const hasHalf = half - whole === 0.5;
  if (!hasHalf) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
};

/** The empty card's one line, when a meal has no ideas. */
export const emptyStateText = (notes: PlanNote[]): string =>
  notes.some((n) => n.code === "unknown_preference") ? "One filter isn't supported yet" : "No ideas fit your filters";

/** The grey hint line on a meal planned around today's logs. */
export const adjustedHintText = (notes: PlanNote[]): string =>
  notes.some((n) => n.code === "day_over_energy")
    ? "Lighter ideas, today is nearly at your target"
    : "Planned around what you've logged today";

/** The amber chip above the tabs, or null when every food group can be reached. */
export const serveChipText = (notes: PlanNote[]): string | null => {
  const short = serveNotes(notes);
  if (short.length === 0) return null;
  if (short.length === 1) return `${GROUPS[short[0].group].name} short today`;
  return `${short.length} food groups short today`;
};

/** The sheet the chip opens: a title and one line per food group. */
export const serveSheet = (notes: PlanNote[]): { title: string; lines: string[] } | null => {
  const short = serveNotes(notes);
  if (short.length === 0) return null;
  const lines = short.map((n) => {
    const g = GROUPS[n.group];
    return `Even the most filling ideas reach about ${formatServes(n.best)} of your ${formatServes(n.target)} ${g.word} serves. ${g.tip}`;
  });
  const title = short.length === 1 ? `${GROUPS[short[0].group].name} ${short[0].group === "fruit" ? "is" : "are"} short today` : `${short.length} food groups are short today`;
  return { title, lines };
};
