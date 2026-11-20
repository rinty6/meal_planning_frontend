# Build brief: planner follow-ups (m4-11, m5-06, m5-07, m5-09, m6-03, m3-05)

Written 2026-11-21 for a Claude agent working alone for several hours, without
the original session. Backend only: no screen changes in this brief (screens
need a design first). Every task here has its decisions made. Work task by
task, commit each task locally, and stop a task (not the whole run) if this
brief and the code disagree.

## Repos and branch

Both repos on `feature/meal-planning-redesign`. In BOTH: check out that
branch, `git pull`, `npm install` if `node_modules` is missing. Expected
latest commits: backend `fix(planner): live-review fixes for plate shape,
snacks and drinks` (15a78a9); app `docs: planner follow-ups brief`. If either
is missing, stop and report.

## Hard rules

1. **One local commit per task, backend repo only. Do not push.** Messages are
   given per task. End every message with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
2. **No database access, no `.env`, no migrations, no data writes.** Never run
   the scripts of T6 and T7 against a database; the user runs them on the
   laptop. Test with fixtures and fake db objects. Database-backed test files
   cannot run without `.env`: expected, list them in the report.
3. **Do not touch the app repo**, the old FatSecret planner path in
   `routes/mealPlan.js` beyond what a task says, or anything that builds or
   uploads (no EAS, no `expo start`).
4. In prose and comments, do not join clauses with " - " or an em dash.
5. Every new rule gets a short comment saying why, with the date and the task
   id (`// T3, 2026-11-21: ...`), like the existing code.
6. After each task run `npm test`. Do not commit a task with failing
   non-database tests. New test files are throwaway sprint tests (checklist
   m7-06): say so in their header and add them to the `test` script.
7. **Regex gotcha:** write regexes with the Edit tool or in a file. Writing `\b`
   through a shell heredoc into Python or node has produced a BACKSPACE byte
   (0x08) in this repo before; `grep -P '\x08' -r src` must find nothing.
8. If a task cannot be finished, commit nothing for it, write why in the report,
   and continue.

## Facts to rely on

- `meal_logs`: `id, user_id, date, meal_type, food_name, calories, protein,
  carbs, fats` (TOTALS for the row's servings), `servings` (0.5 steps),
  `nutrients` (jsonb: numbers or null per key, plus `serving_grams` and the
  string `vitamin_a_convention`), `external_id`, `source` (`'catalog'` for
  catalogue foods, external_id = the food's publicId).
- `meal_plan_events`: `user_id, event_type ('shown' | 'selected' | 'accepted' |
  'loved' | 'skipped' | 'shuffled'), meal_type, item_id, item_title, payload
  (jsonb), created_at`. Written by `recordEvents` in `routes/mealPlan.js`, read
  by `getEventProfile` there (last 300 events).
- Planner pieces: `services/catalogPlates.js` (`personalSignals`,
  `buildCatalogRecommendations`, `plateToItem`: plate items carry `items[]`
  with `publicId`, main first), `services/todayIntake.js` (`readTodayLogs`,
  `summariseToday`, `adjustTargets`, `ENERGY_CLAMP`),
  `services/plannerPool.js` (`NOT_ON_A_PLATE`, `isPlateWorthy`,
  `getPlannerPool`), `services/dailyCalorieTarget.js`
  (`getDailyCalorieTargetContext({ db, userId, dateStr })` returns
  `dailyCalories`, `serveTargets` (daily ADG serves, with a `row` key),
  `waterTarget`, `alcoholBudget`, `demographics`).
- Catalogue schema is in `src/db/food_schema.js`. Nutrition profiles are stored
  PER SERVING ROW: each `catalog_food_servings` row points at its own
  `nutrition_profiles` row, and `nutrition_profiles.alcohol_g` is the grams of
  alcohol in that serving. One standard drink = 10 g of alcohol (NHMRC).

---

## T1 · Meal Summary +/- rescales the stored nutrients (m4-11)

`PUT /api/meals/update/:id` in `routes/meals.js` writes servings, calories,
protein, carbs and fats, but never `nutrients`, so after a +/- every nutrient
(fibre, sugar, sodium, alcohol_g...) still describes the servings at log time.
Must land before the alcohol screen (m6-04), which reads `alcohol_g`.

1. New pure helper `scaleNutrients(nutrients, oldServings, newServings)` in a
   new `src/services/mealLogNutrients.js`: multiplies every FINITE NUMBER value
   by `newServings / oldServings` (round to 3 decimals); `null` stays `null`;
   strings and other non-numbers are kept as they are; `serving_grams` is NOT
   scaled (it is the size of one serving). Bad or zero `oldServings` returns
   the nutrients unchanged.
2. In the route: read the row's current `servings` and `nutrients` first (same
   user check as the update), then write `nutrients: scaleNutrients(...)`
   in the same update. A row that does not exist or is not the user's still
   gives 404 exactly as today.
3. Tests (`mealLogNutrients.test.js`): 1 -> 2 servings doubles fibre and
   alcohol_g; 2 -> 0.5 quarters them; null stays null; `serving_grams` and
   `vitamin_a_convention` unchanged; oldServings 0 or missing changes nothing.

Commit: `fix(meals): Meal Summary +/- rescales stored nutrients (m4-11)`.

## T2 · Part-foods never go on a plate (m5-01 follow-up d)

Egg yolk on its own and egg white on its own were offered as mains. Add to
`NOT_ON_A_PLATE` in `plannerPool.js`: names with `\byolk\b`, `\begg white\b`,
`\balbumen\b`, and `\bwhite only\b`. Keep "Egg, chicken, whole, ..." allowed.
Tests in `plateBuilder.test.js` beside the other `isPlateWorthy` tests, one
name per rule plus a whole egg that stays allowed.

Commit: `fix(planner): egg yolk and egg white alone never go on a plate`.

## T3 · Favourites, history and skip work on catalogue plates (m5-09)

Today `personalSignals` matches FOOD names against event TITLES. A plate's
title is "Apple & cheddar", so a loved or skipped plate never matches any
food, and the skip signal does nothing on catalogue plates.

1. `recordEvents` (routes/mealPlan.js): when the item is a catalogue plate
   (`item.source === "catalog_plate"` and `item.items` is an array), add
   `payload.food_ids` = the plate's food publicIds, main first. Nothing else
   about events changes.
2. `getEventProfile`: also collect `skippedMainIds` (the FIRST food id of a
   skipped plate: the main is what made the plate unwanted; sides are shared
   by many plates) and `likedFoodIds` (every food id of a loved or accepted
   plate). Same 300-event window as today.
3. `personalSignals`: a food also gets the liked bonus (0.015, as today for
   titles) when its `publicId` is in `likedFoodIds`, and `isSkipped` is also
   true when its `publicId` is in `skippedMainIds`. Title matching stays for
   old events. The caps in plateBuilder stay: these remain tie-breakers.
4. Tests in `catalogPlates.test.js`: a skipped plate's main is excluded and its
   sides are not; a loved plate's foods get the bonus; an old title-only event
   still works; `recordEvents` payload (export a small pure helper for the
   payload so it is testable without a db).

Commit: `feat(planner): skip and love work on catalogue plates by food id (m5-09)`.

## T4 · Say which constraint could not be met (m5-06, backend only)

The planner must name a conflict instead of silently missing a goal. No screen
shows this yet (m6-07 needs a design); the payload carries it.

1. `adjustTargets` (todayIntake.js) also returns `energyFactor` (the factor
   BEFORE the clamp) so the route can tell when the 80% floor was hit.
2. New pure `planNotes({ recommendationsByMeal, shortByMeal, blocked,
   dailyServes, eatenServes, energyFactor, builtAllMeals })` in a new
   `src/services/planNotes.js`, returning an array of notes:
   - `{ code: "unknown_preference", labels }` when `blocked` is not empty.
   - `{ code: "few_ideas", meal, shown, wanted: 5 }` per meal with
     `shortBy > 0`.
   - `{ code: "day_over_energy" }` when `energyFactor < ENERGY_CLAMP.min`
     (what is already logged leaves less than 80% for the rest of the day).
   - Only when `builtAllMeals` is true: for each food group with a daily
     target above 0, the BEST the plan can reach is `eatenServes[g]` plus, for
     each built meal, the highest `serves[g]` among that meal's plates
     (`plateToItem` puts them at `item.plate.serves`; read it to confirm).
     When that best is below 90% of the daily
     target: `{ code: "serve_target_out_of_reach", group, target, best }`
     (numbers rounded to 1 decimal). This is what will say "pregnancy needs
     8.5 grain serves and today's plan can reach about 7".
3. Route: catalogue branch only, add `plan_notes: planNotes(...)` to the
   payload. `builtAllMeals` is true when no `mealType` was requested.
4. Tests (`planNotes.test.js`): each code appears when it should and not
   otherwise; a pregnancy-like fixture (grain target 8.5, best plates reaching
   7) gives `serve_target_out_of_reach` for grain; `energyFactor` 0.6 gives
   `day_over_energy`; no notes for an ordinary day.

Commit: `feat(planner): name the constraint a plan cannot meet (m5-06, backend)`.

## T5 · Serve progress, computed but dark (m6-03)

Build it behind a flag; the user has not decided whether serves are shown
(m0-06), so nothing renders it.

1. New route in `routes/meals.js`:
   `GET /api/meals/serve-progress/:clerkId?date=YYYY-MM-DD`, with the same
   middleware chain as `/most-consumed/:clerkId` (`requireClerkAuth`,
   `ensureClerkIdMatch("params")`, `attachUserFromAuth`).
2. Flag: `process.env.SERVE_PROGRESS` must be `on`, read per request. When it
   is not, return `404 { error: "Not enabled" }` and do no database work.
3. When on: `getDailyCalorieTargetContext` for the day's targets,
   `readTodayLogs` + `getPlannerPool` + `summariseToday` for what was eaten.
   Respond `{ date, targets: { vegetable, fruit, grain, protein, dairy },
   eaten: {...same keys}, rowsWithoutServes, rows }` where
   `rowsWithoutServes` counts rows that are not catalogue rows found in the
   pool (their serves are unknown, never zero: the screen must be able to say
   so). Put the counting in `summariseToday` (new field, keep old fields) with
   a test.
4. Tests: flag off returns 404 without touching the fake db; the pure parts
   are tested in `todayIntake.test.js`. Keep route logic thin.

Commit: `feat(meals): serve progress endpoint behind SERVE_PROGRESS (m6-03)`.

## T6 · Measure variety across a week (m5-07, a tool, not a change)

"A large pool must not produce the same five meals." Measure before changing
anything. Write the tool; the laptop session runs it against the real pool.

1. `scripts/planner_variety/measure.mjs` (look at how `scripts/diagnose-reminders.js`
   loads `dotenv` and `db`): for 4 profiles (2,000 kcal woman 19-50; 2,800 kcal
   man 19-50; 1,700 kcal woman 51-70; 2,200 kcal pregnant), plan 7
   consecutive days with `buildCatalogRecommendations` (no preferences, the
   same `userId` per profile, `dateStr` changing per day, serve targets from
   `adgServeTargets.js` or hard-coded from its table). Read only.
2. A pure `summariseVariety(daysByMeal)` exported from
   `scripts/planner_variety/varietyStats.js`: per meal, the share of cards whose
   MAIN appeared on an earlier day, distinct mains over the week, and the 5
   most repeated mains with counts. Same for sides.
3. Print a plain table to stdout. No files written.
4. Test `varietyStats.test.js` with a small fixture (3 days, a known repeat).
   Add it to the `test` script.

Commit: `chore(planner): a tool to measure plan variety across a week (m5-07)`.

## T7 · Standard-drink servings, as a script the user runs (m3-05)

0 of 112 alcoholic foods have a standard-drink serving; "Wine, red" defaults
to a 250 ml can (2.74 standard drinks) and one glass cannot be logged.

1. `scripts/standard_drinks/add_standard_drink_servings.mjs`, DRY RUN BY
   DEFAULT; writes only with `--write`. For every active catalogue food whose
   DEFAULT serving's profile has `alcohol_g > 0`:
   - alcohol per gram = default profile `alcohol_g` / default serving
     `grams_equivalent`; standard-drink grams = 10 / that, rounded to 1 decimal;
   - skip foods that already have a serving whose description starts with
     "1 standard drink" (idempotent);
   - with `--write`, in ONE transaction per food: insert a nutrition profile
     copying the default profile with every numeric nutrient scaled by
     (standard-drink grams / default grams) and `alcohol_g` = 10; insert a
     serving "1 standard drink (about N ml)" (N = grams rounded to the nearest
     5) pointing at it; make it the default (unset `is_default` on the others).
   - Read `food_schema.js` for the exact columns and any unique indexes; copy
     every NOT NULL column. If the schema makes any of this impossible, stop
     and report instead of guessing.
2. Dry run prints one line per food: name, current default serving, its
   standard drinks, the new serving, and a total count. Writes nothing.
3. A pure `standardDrinkServing({ alcoholG, grams })` helper with tests:
   a 330 ml beer with 11.94 g gives about 276 g; a 250 ml red wine at 27.4 g
   (2.74 drinks) gives about 91 g, "about 90 ml"; alcohol 0 or grams 0 gives
   null.

Commit: `chore(catalog): script to add a standard-drink serving to alcoholic foods (m3-05)`.

---

## Checks before reporting

- backend `npm test`: all non-database tests pass. List the database-backed
  files that could not run.
- `grep -rP '\x08' src scripts` finds nothing.

## Report (end with this, in this order)

1. Per task: done / partly / skipped, the commit id, files changed.
2. Anything in this brief that the code contradicted, and what you did.
3. Choices you made that the brief did not specify.
4. Check results with counts.
5. What the laptop session must run (T6 tool, T7 dry run) and what to look at.
