# Build brief: plate shape, snacks, today-aware plans, drinks

Written 2026-11-20 for a Claude agent working alone for about 8 hours, without
the original session. Checklist items m5-01 (follow-up), m5-03 (follow-up),
m5-04 and m6-01. All product decisions are made (below). Work task by task,
commit each task locally, and stop a task (not the whole run) if this brief and
the code disagree.

Read these three pages in this folder first. They are the approved designs:

- `HOW_AUSTRALIANS_EAT.html`: why plate shape changes (research + 300 live plates).
- `SNACK_SLOT_DESIGN.html`: the snack tab, snack contents, planning around today.
- `DRINKS_UI.html`: the drink row on cards and the detail page.

## Decisions (user, 2026-11-19 and 2026-11-20)

- **Q1 yes.** Whole dishes (sandwich, burger, pizza, curry with rice...) are
  offered alone or with at most one side that goes with them.
- **D1 recommended.** Snack contents per the table in SNACK_SLOT_DESIGN section 2,
  plus the half-serve rule.
- **D2 recommended.** A snack is one food, or a pair from the pair list.
- **D3 OVERRIDDEN.** Drinks are kept: every plate and snack can carry one
  optional drink (coffee, tea, 100% juice, milk, water) per DRINKS_UI.html.
  Ignore D3's "milk only" text in SNACK_SLOT_DESIGN.
- **D4 recommended.** Food groups react fully to today's logs; energy of an
  unlogged meal stays within 80-120% of its usual size.
- **Lunch's fruit and dairy move to the snack.**
- Q3 (bánh mì, phở built from AUSNUT ingredients) is NOT in this brief.

## Repos and branch

Both repos on `feature/meal-planning-redesign`: backend
`meal_planning_app_backend`, app `meal_planning_frontend`. In BOTH: check out
that branch, `git pull`, `npm install` if `node_modules` is missing. Expected
latest commits: backend `feat(planner): score plates against each user's
food-group serve targets` (124e87b); app `docs: plate shape, snacks and drinks
brief`. If either is missing, stop and report.

## Hard rules

1. **One local commit per task, in the repo the task touches. Do not push**
   (the Pi has no GitHub login; the user fetches from the Pi). Messages are
   given per task. End every message with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
2. **No database access, no `.env`, no migrations, no data writes.** Everything
   here is code plus `src/data/mealTable.json`. Test with fixtures and fake db
   objects. Database-backed test files cannot run without `.env`: expected,
   list them in the report, do not work around it.
3. **Do not tune constants against real data.** You cannot see the live pool.
   Use the values in this brief. The laptop session measures and tunes later.
4. **Do not run EAS, `expo start`, or anything that builds or uploads.**
5. Do not touch the old FatSecret planner path in `routes/mealPlan.js` beyond
   what a task says (strangler rule: it stays until plates have run on main).
6. In prose and comments, do not join clauses with " - " or an em dash.
7. Every new constant or rule gets a short comment saying why, with the date
   and the task id (e.g. `// P2, 2026-11-20: ...`), like the existing code.
8. After each task run `npm test` in that repo (app: also `npx tsc --noEmit`
   and `npx expo lint`). Do not commit a task with failing non-database tests.
9. If a task cannot be finished, commit nothing for it, write why in the report,
   and continue with the next task only if it does not depend on it. P5
   depends on P4; A1 depends on P4; A2 depends on P6.

## Facts to rely on

- Key files: `src/services/plannerPool.js` (pool, `candidatesForMeal`,
  `NOT_ON_A_PLATE`), `src/services/plateBuilder.js` (`buildOne`, `buildPlates`,
  `PREFERRED_SIDES`, `SIDE_ORDER`, `isSideWorthy`, `RAW_IS_NORMAL`),
  `src/services/catalogPlates.js` (`buildCatalogRecommendations`,
  `plateToItem`), `src/services/mealTable.js` + `src/data/mealTable.json`
  (kind plate|drink|never, roles per meal), `src/services/mealServePattern.js`,
  `src/services/mealSplit.js` (25/30/35/10), `src/routes/mealPlan.js`
  (catalogue branch near `isCatalogPlannerEnabled`, `MEAL_TYPES` at the top is
  the three-meal list for this route).
- Pool foods look like `{ id, publicId, name, shortName, group: "ausnut-135",
  per100g: { calories_kcal, ... }, serves100g: { grain, vegetable, fruit, dairy,
  protein }, servings: [{ description, grams, isDefault }], verdicts, image }`.
- `buildPool` keeps only `kind === "plate"` rows, which is why the pool has no
  drinks. Drink sub-groups: 111 tea, 112 coffee, 113 100% juice, 118 water,
  191 milk and 201 plant milk are already plate kinds (snack mains).
- Real drink names in the catalogue (servable, not discretionary): "Coffee,
  flat white/cappuccino/latte, single shot & regular fat cow's milk" (and
  reduced fat, skim, soy, oat, almond, decaffeinated variants), "Coffee, long
  black, single shot", "Coffee, espresso", "Tea, black", "Tea, green", "Tea,
  herbal", "Tea, black, dry" (a leaf, never suggest), "Juice, orange,
  commercial" (default serving "1 bottle, small, Pop Top (250 ml)"), "Juice,
  apple, commercial", "Juice, pineapple, commercial, added sugar" (never),
  "Juice, lemon" / "Juice, lime" (flavourings, never), "Water, tap" (default
  "1 drink bottle (437 ml)"), "Water, bottled", "Mineral water, natural",
  "Water, bottled, carbonated or soda water", "Water, ice" (never). Most
  drinks' default serving is "100 g": portion them by ml (1 ml = 1 g is fine).
- Discretionary foods are already excluded from the pool SQL.
- `meal_logs`: `user_id, date (YYYY-MM-DD), meal_type, calories (TOTAL for the
  row), external_id, source, servings, nutrients (jsonb)`. Catalogue rows have
  `source = 'catalog'` and `external_id = pool food publicId`. The planning
  screen already sends the user's LOCAL date as `?date=`; the route parses it
  into `dateStr`.
- `targetContext.demographics` holds `dateOfBirth, gender, isPregnant,
  isBreastfeeding`; `getAgeFromDateOfBirth` is in `dailyCalorieTarget.js`.
- AUSNUT sub-group codes used below (all `ausnut-NNN`): 121 rice/grains,
  122 breads, 123 flat breads/muffins, 124 pasta, 125/126 cereals, 132 crackers,
  135 cereal mixed dishes (sandwiches, burgers, pizza, wraps, pasta dishes,
  sushi), 136 pancakes/batter, 151-155 fish, 156 fish mixed dishes, 161-168
  fruit, 169 fruit dishes, 171 eggs, 172 egg dishes, 181-185 meat,
  187/188/189 meat and poultry mixed dishes, 191 milk, 192 yoghurt, 194 cheese,
  201 plant milk, 205 plant yoghurt, 206 meat substitutes, 211-216 soups,
  221 seeds, 222 nuts, 235 dips, 241 potato, 242-248 vegetables, 249 vegetable
  dishes and salads, 251/252 legumes.

---

## P1 · Foods that must never be on a plate (backend)

Found in the 300-plate check on 2026-11-19. Add to `NOT_ON_A_PLATE` in
`plannerPool.js` (or `isPlateWorthy`), each with a comment:

- dry legumes not caught by the existing rule: names with `\bdry\b` in groups
  251 and 121 without a cooked word ("Lentil, green, hulled, dry");
- infant foods: `^infant\b` ("Infant pasta, added Fe");
- `\b(evaporated|condensed)\b` milk;
- `^panettone\b`, `^bun, sweet\b`;
- `^semolina\b`, `^tapioca\b` (ingredients, not sides).

Extend `plateBuilder.test.js` (or `plannerPool.test.js`) with one name per rule.
Commit: `fix(planner): keep dry lentils, infant foods, evaporated milk and sweet buns off plates`.

## P2 · Plate shape: whole dishes and sides that go with the main (backend)

The core change. Today every main gets 1-2 sides chosen by food-group need, so
a hamburger gets strawberries and yoghurt, and a pizza gets bamboo shoots.

1. **Shape of a main.** New `src/services/plateShape.js` exporting
   `shapeFor(food, meal)` returning one of:
   - `whole`: a complete meal on its own. Groups 135, 156, 211-216. Also ANY
     group when the name matches `WHOLE_BY_NAME`:
     `/\bsandwich|\broll\b|burger|wrap\b|pizza|\bbowl\b|sushi|lasagne|risotto|paella|fried rice|kebab|taco|burrito|nachos|\bpie\b|with (rice|noodles|pasta|potato|mash|chips|bread|toast|english muffin)\b/i`,
     and salads with a protein in group 249
     (`/^salad\b.*\b(chicken|beef|lamb|pork|tuna|salmon|prawn|egg|tofu|lentil|chickpea|haloumi|feta)\b/i`).
   - `needs_starch`: curries, stir-fries, casseroles, stews and similar
     without a starch in the name: groups 187, 188, 189 and any name matching
     `/curry|stir-?fry|casserole|stew|goulash|chilli con carne|bolognai?se/i`
     that is not `whole`.
   - `meat_and_veg`: plain protein at lunch and dinner: groups 151-155,
     181-185, 206, 252, 251 (as main), 171 and 172 at lunch/dinner.
   - `cereal`: breakfast groups 125, 126, 192, 205, 169.
   - `toast`: breakfast groups 122, 123, 136.
   - `eggs`: breakfast groups 171, 172 (unless `whole` by name, e.g. eggs
     benedict "with bread or English muffin").
   - anything else: `meat_and_veg` at lunch/dinner, `toast` at breakfast.
   `whole` wins over everything; then the name rules; then the group.

2. **Side slots per shape** (`SHAPE_SIDES`), each slot a set of groups:
   - `whole`: 0 required, 1 optional. Lunch optional: salad and raw vegetables
     (242, 244, 246, 247, 248, 249), fruit (161-167), yoghurt (192). Dinner
     optional: 242, 244, 245, 246, 247, 248, 249. Breakfast optional: fruit.
     Soups (211-216): optional bread (122, 123) instead.
   - `needs_starch`: 1 required STARCH (121, 124, 123, 241), 1 optional GREEN
     (242, 244, 245, 246, 247, 248, 249).
   - `meat_and_veg`: 1 required STARCH (241, 121, 124, 122, 123, and 243 for
     sweet potato, pumpkin) and 1 required GREEN (242, 244, 245, 246, 247, 248,
     249). This is the survey's "chicken or steak with starchy and green
     vegetables".
   - `cereal`: 1 required DAIRY (191, 192, 201, 205) unless the main is itself
     dairy (192, 205), then 0; 1 optional fruit (161-168).
   - `toast`: 1 required TOPPING (171, 172, 194, 246, 247 avocado only, 248
     mushroom only, 252 baked beans only) for 122/123; for 136 (pancakes) the
     topping is fruit or yoghurt. 1 optional fruit.
   - `eggs`: 1 required BREAD (122, 123), 1 optional (246 tomato, 244 spinach,
     248 mushroom).
   Keep every existing side rule (`isSideWorthy`, raw vegetables, garnish
   size, energy caps, one kind per plate, `MAX_SIDE_REPEAT`).

3. **`buildOne` follows the shape.** Required slots are filled first from their
   groups, then optional slots only if the energy still has room (the main
   would otherwise be above 1.5 of its default serving) or the serve need for
   that slot's group is above 0.5. A `whole` plate with 0 sides is valid:
   remove the `chosen.length === 0` rejection for `whole` only. Within a slot
   keep `sideScore` (serve need, preferred groups) for ranking. Drop
   `PREFERRED_SIDES` and `SIDE_ORDER` only if nothing else uses them; otherwise
   leave them and say so.

4. **Plate items carry `shape`** (on the plate object, e.g.
   `plate.shape = "whole"`), and `plateToItem` passes it as `item.shape`.

5. **Tests** (`plateShape.test.js`, throwaway sprint test, m7-06; add to the
   `test` script): `shapeFor` for "Hamburger, beef patty & salad, homemade"
   (whole), "Sandwich or roll, chicken & salad" (whole), "Curry, chicken with
   rice or noodles" (whole), "Curry, homemade, beef" in 187 (needs_starch),
   "Beef, steak, grilled" in 181 (meat_and_veg), "Breakfast cereal, whole
   wheat, biscuit" (cereal), "Soup, broth with meat & noodles" (whole);
   with fixtures: a burger plate never gets a fruit at dinner; a steak plate
   has one starch and one green side; a cereal plate has a dairy side; a
   burger alone is a valid plate when it fits the energy window.

Commit: `feat(planner): plate shape: whole dishes stand alone, sides go with the main`.

## P3 · Fruit and dairy move from lunch to the snack (backend)

In `mealServePattern.js` change only these two rows (each still sums to 1):

```
fruit: { breakfast: 0.4,  lunch: 0.1,  dinner: 0,    snack: 0.5 },
dairy: { breakfast: 0.35, lunch: 0.15, dinner: 0.15, snack: 0.35 },
```

Update the header comment (why: HOW_AUSTRALIANS_EAT.html, user decision
2026-11-20) and the tests that pin the old numbers.
Commit: `feat(planner): lunch's fruit and dairy share moves to the snack`.

## P4 · The snack slot (backend)

1. **Meal table snack column** (`src/data/mealTable.json`, keep the format and
   `validateMealTable` passing):
   - set `snack: null` for 133, 169, 196, 197, 262, 282;
   - set `snack: "main"` for the raw-vegetable groups 243, 244, 245, 246, 247
     (only raw, RAW_IS_NORMAL foods will qualify, step 3);
   - keep 132 (crackers) and 235 (dips) but they are pair-only (step 3).
   Add a top-level `"changes"` note line dated 2026-11-20 for these edits.
   (The source of this JSON lives outside git; the laptop session will sync it.)

2. **The 4-slot plan.** In the catalogue branch of `routes/mealPlan.js`, build
   snack plates too: meal targets come from `buildMealCalorieTargets` with all
   four slots (25/30/35/10 instead of the 3-slot rescale), and serve targets
   from `mealServeTargets(..., { slots: ["breakfast","lunch","dinner","snack"] })`.
   The legacy path stays three meals. `mealType=snack` requests must work.

3. **`src/services/snackBuilder.js`** exporting
   `buildSnacks({ foods, targetKcal, serveTarget, seed, count = 5, bonusFor,
   excludeFoodIds })` returning `{ plates, shortBy }` shaped exactly like
   `buildPlates` (so `plateToItem` and the app need nothing new), with
   `plate.meal = "snack"` and `plate.shape = "snack"`:
   - **Half-serve rule:** every snack food, at its chosen portion, gives at
     least 0.5 serve of one of the five groups.
   - **Raw vegetables** (243-247) only when the name has `raw` and the kind is
     in `RAW_IS_NORMAL`; they are pair-only.
   - **Pair-only foods:** crackers (132), dips (235), raw vegetables.
   - **Single snack:** one food when a normal portion (`bestPortion`) is within
     the energy window on its own (handful of almonds, tub of yoghurt, glass
     of milk).
   - **Pairs** (`SNACK_PAIRS`, by family): fruit with cheese, yoghurt or nuts;
     yoghurt with fruit or nuts/seeds; cheese with fruit, crackers or raw
     vegetables; raw vegetables with dip or cheese; crackers with cheese or
     dip; milk with fruit; nuts with fruit or yoghurt. Families come from the
     group (fruit 161-168, yoghurt 192/205, cheese 194/203, milk 191/201, nuts
     221/222, crackers 132, dip 235, raw veg 243-247).
   - The first food is chosen toward the group today's snack target lacks
     most (serve need), the second to fit the energy.
   - **Dried fruit (168):** at most one of the five snacks.
   - Same energy window as plates (`MAX_ENERGY_MISS`), same one-kind-per-card
     and repeat rules, seeded like `buildPlates`.
   - Titles: "Apple & cheddar" (two short names joined by " & "), one short
     name for a single.

4. **Short name fix:** `shortNameFor` turns "Dip, hummus (hommus),
   commercial" into "Dip". Make "Dip, X" give "X" ("Hummus"), with a test.

5. **Tests** (`snackBuilder.test.js`, add to `test` script): no cake, custard
   or dairy dessert ever appears (fixtures in those groups); crackers and dips
   never alone; a raw carrot only with dip or cheese; a cooked carrot never; a
   1 tbsp coconut fails the half-serve rule; dried fruit at most once in 5; a
   snack short of dairy picks a dairy first food more often (compare counts
   over 10 seeds, like `mealServePattern.test.js` does); single almonds is a
   valid snack.

Commit: `feat(planner): snack slot with five-food-group snacks and pairs`.

## P5 · Planning around what's logged today (backend, needs P4)

1. New `src/services/todayIntake.js`:
   - `readTodayLogs({ db, userId, dateStr })`: one select of
     `meal_type, calories, external_id, source` from `meal_logs` for that user
     and date. Accept `db` as a parameter (fake in tests), like
     `getAlcoholSummary` in `alcoholLogs.js`.
   - `summariseToday(logs, poolByPublicId)`: `{ eatenKcal, eatenServes,
     loggedMeals: Set, fingerprint }`. Energy from every row's `calories`.
     Serves only for `source === 'catalog'` rows whose `external_id` is in the
     pool: grams = `calories / per100g.calories_kcal * 100`, then serves from
     `serves100g`. This avoids the servings/nutrients ambiguity (m4-11). Other
     rows add energy and ZERO serves (safe side: serves are minimums).
     `fingerprint` = row count + sum of calories, rounded, as a string.
   - `adjustTargets({ mealKcal, dailyServes, eaten, loggedMeals })`: returns
     `{ kcalByMeal, serveTargetsByMeal, adjustedMeals }`. Logged meals keep
     their normal targets. Unlogged meals: energy =
     `normal * clamp((daily - eatenKcal) / sum(normal of unlogged), 0.8, 1.2)`;
     serves = `mealServeTargets(max(0, daily - eaten) per group, { slots:
     unlogged })`. `adjustedMeals` lists the unlogged meals, and is empty when
     nothing is logged (then everything equals today's behaviour exactly).
2. Wire it into the catalogue branch only. Add the fingerprint to the cache
   key. Add `adjusted_meals: [...]` to the payload.
3. Tests (`todayIntake.test.js`): nothing logged gives the normal targets
   unchanged; the worked examples of SNACK_SLOT_DESIGN section 3, recomputed
   with the P3 dairy row (lunch 0.15, dinner 0.15, snack 0.35) for 4 dairy
   serves a day with breakfast logged: porridge from a plate carrying 1.2
   dairy gives lunch/dinner/snack 0.65/0.65/1.51; a barcode breakfast (0
   serves known) gives 0.92/0.92/2.15; energy for a 2,000 kcal day gives
   480/560/160 after an 800 kcal breakfast, and the same after 1,100 kcal
   because of the 80% floor. A FatSecret row adds energy and no serves; a fake
   db is queried once.

Commit: `feat(planner): plan unlogged meals around what is already logged today`.

## P6 · Drinks (backend)

Rules are in DRINKS_UI.html ("Which drinks, when" and "Rules"); implement them
exactly.

1. Keep drinks in the pool: `buildPool` also collects `kind === "drink"` rows
   (and milk 191/201 foods) into a separate cached list, exported as
   `getPlannerDrinks()` or as a second field; do not change what
   `getPlannerPool` returns to its current callers.
2. New `src/services/drinkPicker.js`: `drinksForPlate({ drinks, meal, plate,
   person, rand, juiceUsed })` returns up to 3 options `[{ foodId, publicId,
   name, shortName, grams, serving_description, kcal, nutrients }]` with the
   first as the suggestion. Portions: coffee and tea 250 ml ("1 cup"), juice
   250 ml ("1 small bottle (250 ml)"), milk 250 ml ("1 glass"), water 250 ml
   ("1 glass"). Name allow and block lists per DRINKS_UI. Energy rule: a drink
   over 40 kcal only when `plate.fit <= 0.95`. Caffeine rule: none under 18
   (unknown age counts as adult); pregnancy or breastfeeding: coffee at
   breakfast only, decaf elsewhere. Juice on at most one of the 5 plates per
   meal. Allergen and diet filters via `evaluateFood`, exactly like food.
3. `buildCatalogRecommendations` attaches `plate.drinks` (array); `plateToItem`
   passes `item.drinks`. Drinks never change `item.calories` (the app adds the
   drink only when the user turns it on).
4. Tests (`drinkPicker.test.js`): no coffee at dinner; no coffee for a
   16-year-old; decaf at lunch when pregnant; juice on at most one plate; no
   juice with added sugar, no lemon juice, no dry tea; a plate at 1.05 fit
   gets a zero-energy first drink; a milk allergy removes the flat white.

Commit: `feat(planner): optional drink suggestions on every plate`.

## A1 · Snack tab and labels (app, needs P4; P5 optional)

1. `services/planning.types.ts`: `MEAL_TYPES` and `MealType` become the four
   types from `constants/mealTypes.ts` (import, do not copy). Fix every place
   that breaks; `ItemsByMeal` gains `snack`.
2. Planning screen tabs (`app/(tabs)/meal/planning.tsx`, the row mapping
   `MEAL_TYPES`): four tabs, label `text-sm` (14 px) instead of the default,
   count line "N ideas" instead of "N dishes". Selected style unchanged.
3. Card label (`plateLabel` used by DishCard): snack plates show "SNACK" (one
   food) or "SNACK · 2 FOODS" on the snack green `#15803D` (Tailwind `snack`,
   already generated since m4-09) instead of navy; a `whole` plate with one
   food shows "DISH"; other plates unchanged.
4. Hint line: when `payload.adjusted_meals` includes the selected meal, show
   one grey line under the meal header: "Planned around what you've logged
   today" (12 px, gray-500, a small info icon), as in SNACK_SLOT_DESIGN.
5. Picking, multi-select, plate detail and logging already pass the selected
   meal type; confirm snack plates log as `meal_type: 'snack'`.
6. Tests: extend `utils/plateLog.test.ts` with a snack plate. tsc, lint, tests.

Commit: `feat(planner): snack tab, snack and dish labels, today hint`.

## A2 · The drink row (app, needs P6)

Build DRINKS_UI.html exactly:

1. DishCard: under the foods line, a drink row for `item.drinks[0]` (cup icon,
   name, portion, kJ via `formatEnergy`) with a "+ Add" / "✓ Added" toggle,
   off by default. When on, the headline energy adds the drink and the unit
   text says "kJ · with drink". State lives per card key on the screen (like
   selection), not in the item.
2. PlateDetail: a "Drink · optional" section with chips None + up to 3
   `item.drinks`; default None, or the card's drink if it was on.
3. Logging: when a drink is on, `logEntriesFor` adds one more row (source
   "catalog", same meal) built like a plate food row. Keep unknown nutrients
   as null. Add the drink to `utils/plateLog.ts` with tests (drink off: no
   row; drink on: one extra row with the drink's grams).
4. No drink row when `item.drinks` is empty or missing (legacy path).

Commit: `feat(planner): optional drink on plate and snack cards`.

---

## Checks before reporting

- backend `npm test`: all non-database tests pass. List the database-backed
  files that could not run.
- app: `npx tsc --noEmit` clean, `npx expo lint` no new errors, `npm test` passing.

## Report (end with this, in this order)

1. Per task: done / partly / skipped, the commit id, files changed.
2. Anything in this brief that the code contradicted, and what you did.
3. Constants you had to invent (should be none), with where they are.
4. Check results with counts, per repo.
5. Questions for the user and the laptop session, if any.
