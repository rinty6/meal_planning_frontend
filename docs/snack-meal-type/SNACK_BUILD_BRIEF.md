# Build brief: Snack as a fourth meal type (checklist m4-09)

Written 2026-11-16 for a Claude agent working without the original session.
The design is approved by the user. The full design, with mockups, is next to
this file: `SNACK_MEAL_TYPE_DESIGN.html`. Read it first; this brief is the
build plan that comes out of it.

## Repos and branch

Two repos, both on branch `feature/meal-planning-redesign`:

| Repo | GitHub name | Holds |
|---|---|---|
| backend | `meal_planning_app_backend` | Express + Drizzle, Node ESM, `npm test` |
| app | `meal_planning_frontend` | Expo / React Native, NativeWind, TypeScript |

Before starting, in BOTH repos: `git checkout feature/meal-planning-redesign`,
`git pull`, and `npm install` if `node_modules` is missing. Expected latest
commits: backend `feat(targets): NHMRC standard-drink limit...`, app
`docs: Snack build brief...`. If they are missing, stop and report.

## Hard rules

1. **Do not commit, push, or create branches.** The user commits their own work.
   Finish by printing the commands (see "Report").
2. **No database access and no `.env`.** None is needed: `meal_logs.meal_type`
   is plain text and the save route does not validate it, so `"snack"` is
   already storable. No schema or migration change.
3. **Do not run EAS, `expo start`, or anything that builds or uploads.**
   Checks are `npm test`, `npx tsc --noEmit`, `npx expo lint` only.
4. **Do not touch** `src/routes/recommendation/` (frozen old ML path),
   `src/config/cron.js`, `src/routes/mealPlan.js`, or the app's planner files
   (`services/planning.*`, `services/recommendation.ts`,
   `components/MealTimelineSection.tsx`). The planner keeps three slots until
   checklist m5-04.
5. In prose and comments, do not join clauses with " - " or an em dash.
6. If anything in the code contradicts this brief, stop that part and report
   it rather than guessing.

## What Snack is (decided by the user)

- Any time, never expected. **No reminder push, no Pip check-in, never a
  "skipped" state.** A day with no snack is a normal day.
- **D1** Snack is LAST in every list: breakfast, lunch, dinner, snack.
- **D2** Never pre-selected. The time-of-day default stays: before 11:00
  breakfast, before 17:00 lunch, otherwise dinner. Snack is only chosen by the
  user, or by opening "+ Add Food" from the Snack section of Meal Summary.
- **D3** Colour `#15803D` (white text on it is 5:1), Ionicons icon
  `nutrition`.
- **D4** Calorie Summary insights treat Snack as a fourth slot, and a day
  with no snack must never be reported as a gap or a skip.
- Empty Snack section text: **"Nothing between meals. That's fine."** The
  other three keep "No food logged yet."

## The bug this fixes

The backend counts every log for a date in the day's total, but Meal Summary
lists only rows whose type is breakfast, lunch or dinner
(`app/(tabs)/meal/summary.tsx`, the three `meals.filter` lines). A snack log
today would raise the total and appear nowhere, with no delete button. The
cure is one shared list per repo that every screen reads.

## Backend steps

1. New `src/services/mealTypes.js`:
   `export const MEAL_TYPES = Object.freeze(["breakfast","lunch","dinner","snack"]);`
   plus `isMealType(value)` (case-insensitive). Header comment: this is the
   one list; three-meal copies elsewhere are either frozen (recommendation/) or
   the planner's slots (mealPlan.js, until m5-04).
2. `src/services/mealSplit.js`: `MEAL_SLOTS` becomes the imported `MEAL_TYPES`
   (keep the `MEAL_SLOTS` export name so its importers and tests still work).
3. `src/routes/meals.js`, the recent-meals handler (`recent = { breakfast: [],
   lunch: [], dinner: [] }` and the `includes` filter): build both from
   `MEAL_TYPES`, so the response gains a `snack` array. Older app builds
   ignore an extra key.
4. `src/services/calorieInsights.js`: `MEAL_TYPE_ORDER` from `MEAL_TYPES`.
   Then READ the meal-pattern logic and make sure nothing reads an empty snack
   slot as a gap, a skip, or a low-consistency signal (D4). Expected-meal logic
   must stay on the three meals. Any user-facing summary text that lists
   "breakfast, lunch and dinner" gets snack added where it describes totals.
5. `src/services/mostConsumedMeals.js`: use `MEAL_TYPES`.
6. Comment on `meal_logs.meal_type` in `src/db/schema.js`: say snack is valid
   (comment only, no schema change).
7. Tests: one small `src/services/mealTypes.test.js` (order, case-insensitive
   check), and a calorieInsights test if the file has an existing test pattern
   to follow. Add new test files to the `test` script in `package.json`. These
   are throwaway sprint tests (checklist m7-06); list them in the report.

## App steps

1. New `constants/mealTypes.ts` (create the folder). One entry per type, in
   D1 order:
   `type`, `label` ("Snack"), `icon` (Ionicons name), `colorClass` (Tailwind
   class), `emptyText`. Existing values: breakfast `bg-primary` /
   `partly-sunny`, lunch `bg-secondary` / `sunny`, dinner `bg-dinner` /
   `moon`, snack `bg-snack` / `nutrition`. Export `MEAL_TYPES`, the `MealType`
   union, and a `mealTypeLabel(type)` helper.
2. `tailwind.config.js`: add `snack: '#15803D'` next to `dinner`.
3. `components/addfood/MealServingPicker.tsx` (sheet A, barcode and catalogue):
   `MEAL_TYPES` labels come from the shared list, so a fourth row appears in
   the existing style. The pinned "Add to {meal}" button and Cancel must not
   move. `MealTypeLabel` gains "Snack".
4. `app/(tabs)/meal/recipedetail.tsx` and `app/(tabs)/meal/comboDetail.tsx`
   (sheet B, the "Add to meal log" Modal with three hand-written
   TouchableOpacity rows):
   - Replace the three rows with a map over the shared list. Row style
     unchanged (`w-full bg-white py-4 rounded-2xl border border-gray-100 px-4`).
   - **Spacing rule:** every row `mb-3`, except the LAST row, which gets `mb-6`
     (today Dinner has `mb-6` by name; Snack must inherit it, not Dinner).
   - **Height rule:** this sheet does not scroll today. Wrap its contents in a
     `ScrollView` with `maxHeight: '90%'` of the window (use
     `useWindowDimensions`), like sheet A already does, so a small phone or
     large text scrolls instead of cutting off.
   - Widen `handleSelectMeal` / `saveRecipeToMealLog` parameter types to
     `MealType`.
5. `components/VoiceSearchModal.tsx` (sheet C, bottom sheet): its local
   `MealType` and `MEAL_TYPES` come from the shared module. Label rendering
   already capitalises.
6. `app/(tabs)/meal/summary.tsx`: replace the three filters and three
   `<MealSection>` calls with a map over the shared list (`title`, `colorClass`,
   `icon`, `emptyText` from the entry). `MealSection` takes an `emptyText`
   prop instead of the hard-coded "No food logged yet." Snack renders last.
7. `components/RecentMealModal.tsx`: initial state and sections from the
   shared list, including the empty-state check, so the new `snack` bucket
   shows.
8. `components/GuidanceContent.tsx`: "Breakfast, Lunch, Dinner or Snack".
9. `app/(tabs)/calorie/summary.tsx`: fallback copy that says "breakfast,
   lunch, and dinner" includes snack where it describes the meal-slot
   comparison.
10. **Leave as they are, and confirm in the report:**
    `app/(tabs)/index.tsx` (its default meal never returns snack, D2),
    `components/pip/pipHomeState.ts` (its `MealLogType` is the three EXPECTED
    meals; check that `extractLoggedMealTypes` ignores a snack row, so a snack
    never marks lunch as logged), `services/mealLogOutcome.ts` ("Banana is in
    your snack." is already correct), `api/mealLog/addMealPayload.ts` (does not
    restrict the value).

## Checks before reporting

- backend: `npm test`, all passing (it was 157 before this work).
- app: `npx tsc --noEmit` clean, `npx expo lint` clean for touched files,
  `npm test` passing.
- `grep -rn "'breakfast', 'lunch', 'dinner'\|\"breakfast\", \"lunch\", \"dinner\""`
  in both repos: every remaining hit must be one of the deliberate exceptions
  in rule 4 or step 10. List them.

## Report (end with this, in this order)

1. Files changed per repo, one line each on what changed.
2. Check results, with pass counts.
3. Anything that differed from this brief, and why.
4. iPhone test steps for the user (tested on an iPhone dev client):
   - Barcode scan, catalogue search and voice: Snack is the 4th row, logging
     to it works, the button reads "Add to Snack".
   - Food detail and a combo: 4 rows, even gaps, Snack has the bigger gap
     above Cancel, nothing cut off.
   - Meal Summary: Snack section last, green, apple icon, empty text "Nothing
     between meals. That's fine.", a logged snack can be resized and deleted,
     and the four section totals add up to the day total.
   - No push or Pip message about snacks.
5. Commit commands for the user, one command per code block, for each repo:
   `cd` into the repo, `git add` with explicit paths (never `git add .`), and
   `git commit -m "..."`. Suggested messages:
   backend `feat(meals): snack as a fourth meal type, one shared list`,
   app `feat(meals): snack as a fourth meal type across log sheets and summary`.
