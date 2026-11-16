# Build brief: alcohol grams in meal logs (checklist m4-10, plus m1-11 step 1)

Written 2026-11-17 for a Claude agent working without the original session.
Backend only, apart from two small app mapper/type changes. No screen changes:
showing standard drinks to the user is a later task (m6-04) and needs a
design first.

## Why

`backend/src/services/alcoholBudget.js` (m4-07) knows the NHMRC limits (10 a
week, 4 a day, zero under 18 / pregnant / breastfeeding) and
`summariseAlcohol({ budget, drinksByDate, date })` can check a rolling 7-day
window. But nothing can feed it: `nutrition_profiles.alcohol_g` exists on 330
catalogue profiles, yet the catalogue search and barcode payloads never return
it, so `meal_logs.nutrients` never stores it (no log had it when checked on
2026-11-16).
Today the budget would always see zero drinks, which reads as "all clear".
That is the failure ERROR_LOG 015 forbids: unknown must never look like none.

## Repos and branch

Both repos on `feature/meal-planning-redesign`: backend
`meal_planning_app_backend`, app `meal_planning_frontend`. In BOTH: check out
that branch, `git pull`, `npm install` if `node_modules` is missing. Expected
latest commits: backend `feat(meals): snack as a fourth meal type...` (6fa6c76),
app `docs: alcohol-in-logs brief...`. If missing, stop and report.

## Hard rules

1. **Commit locally, one commit per repo, at the end. Do not push** (the Pi has
   no GitHub login; the user fetches from the Pi). Use the messages under
   "Report".
2. **No database access, no `.env`, no migrations.** No schema change is
   needed: `alcohol_g` is already a column, and `meal_logs.nutrients` is jsonb.
   Database-backed tests (catalogSearch, catalogBarcode, barcodeReports,
   foodAttributeFilter, importers/off/displayCase) cannot run without `.env`:
   that is expected, say so in the report, do not try to work around it.
3. **Do not run EAS, `expo start`, or anything that builds or uploads.**
4. Do not change any screen, `routes/mealPlan.js` logic, `routes/recommendation/`,
   or `config/cron.js`.
5. In prose and comments, do not join clauses with " - " or an em dash.
6. If the code contradicts this brief, stop that part and report it.

## Facts to rely on

- Catalogue nutrition profiles are stored **per serving**: `alcohol_g` is the
  grams in that serving row (a 330 mL full-strength beer can is 11.94 g, so
  1.19 standard drinks). One standard drink = 10 g of alcohol.
- AUSNUT has a real 0 for non-alcoholic foods. **0 means known none; null or a
  missing key means unknown.** Keep that distinction everywhere.
- Open Food Facts live lookups (`services/offLive.js`) give alcohol as % vol,
  not grams: leave alcohol as unknown (null) for them. Do not convert.
- FatSecret, manual and recognition logs have no alcohol figure: unknown.

## Backend steps

1. `src/services/catalogSearch.js`: add `alcohol_g` to the selected columns and
   to the `'nutrition', json_build_object(...)` payload, cast to float8 like
   its neighbours.
2. `src/services/catalogBarcode.js`: add `'alcohol_g'` to `NUTRITION_JSON`.
3. Read the servings-update path in `src/routes/meals.js` (the +/- in Meal
   Summary) and find out whether `nutrients` values are totals for the row's
   servings or per one serving. `calories` is documented as a TOTAL. Write the
   answer in the report, and make the next step follow the SAME rule as
   `calories`.
4. New `src/services/alcoholLogs.js`, pure functions plus one db function:
   - `standardDrinksForLog(log)`: returns `{ drinks: number }` when
     `log.nutrients.alcohol_g` is a finite number (0 included), else
     `{ drinks: null }` (unknown). Apply the step-3 rule for servings.
   - `drinksByDateFromLogs(logs)`: returns
     `{ drinksByDate: { 'YYYY-MM-DD': number }, unknownByDate: { 'YYYY-MM-DD': count } }`.
     Unknown logs are COUNTED, never added as zero to the drinks.
   - `getAlcoholSummary({ db, userId, date, budget })`: reads the user's logs
     for the 7-day window ending on `date` (use `WINDOW_DAYS` and the same
     window maths as `summariseAlcohol`; do not write a second window
     function), then returns `summariseAlcohol(...)` plus
     `unknownLogsInWindow`. Accept `db` as a parameter like
     `getDailyCalorieTargetContext` does, so it is testable with a fake.
   - Header comment: why unknown is counted, not zeroed; that nothing shows
     this yet (m6-04 is the screen, and m4-08, a real date of birth, must land
     before any screen shows the budget).
5. `src/routes/mealPlan.js`, checklist m1-11 step 1 ONLY: add a FROZEN comment
   above `ALLERGEN_KEYWORDS`, `VEGAN_BLOCKLIST` and `VEGETARIAN_BLOCKLIST`:
   "FROZEN (m1-11): keyword lists from before the attribute filter. Kept only
   until m5-01 moves candidates onto the catalogue, so a regression can be
   compared against them. Do not add words and do not import these elsewhere."
   No logic change.
6. Tests in `src/services/alcoholLogs.test.js` (throwaway sprint test, m7-06):
   beer can 11.94 g gives 1.19 drinks (to 2 decimals); 0 g gives 0 (known);
   missing or null `alcohol_g` gives null and lands in `unknownByDate`;
   servings rule from step 3; a 7-day window with logs on day -7 (outside),
   -6 (inside) and the day itself; `getAlcoholSummary` with a fake db returning
   rows, for an adult budget and for a zero budget (any drink is over). Add the
   file to the `test` script in `package.json`.

## App steps

1. `api/barcode/barcodeApi.mappers.ts`: where `nutrients` is built for a
   catalogue hit (the block that sets `vitamin_a_convention` from
   `nutrition`), add `alcohol_g: nutrition.alcohol_g ?? null`, rounded the
   same way as the other gram values in that block. In the blocks that build
   nutrients for user-entered or OFF foods (they set `vitamin_a_convention:
   null`), add `alcohol_g: null`.
2. `api/addFood/addFoodApi.types.ts` (and `api/barcode/barcodeApi.types.ts` if
   it types `nutrition`): add `alcohol_g?: number | null`. The catalogue-search
   mapper already spreads `hit.nutrition` into `nutrients`, so it needs no
   logic change: confirm this in the report.
3. If an app test exists for these mappers (`*.test.ts` beside them), extend it
   with one catalogue hit carrying `alcohol_g` and one user-entered food
   carrying `alcohol_g: null`.

## Checks before reporting

- backend: `npm test`. The non-database tests must all pass; list the
  database-backed ones that could not run and why.
- app: `npx tsc --noEmit` clean, `npx expo lint` with no new errors, `npm test`
  passing.

## Report (end with this, in this order)

1. Files changed per repo, one line each.
2. The answer to backend step 3 (totals or per serving), with the line that
   proves it.
3. Check results with counts.
4. Anything that differed from this brief, and why.
5. The two local commit ids. Messages:
   backend `feat(alcohol): carry alcohol grams into logs, count unknown separately`,
   app `feat(alcohol): keep alcohol grams on logged catalogue foods`.
