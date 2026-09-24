# `meal_app/api/` — one API file per feature

This folder replaces the "everything in `services/mealAPI.tsx`" pattern (2,312 lines
mixing FatSecret proxying, image-lookup heuristics, recipe search, combos and three
different caches, where no single call path can be audited any more).

## Rules

1. **One folder per feature, named after the screen or component it serves.**
   `api/addFood/` serves `components/addfoodmodal.tsx`. When meal planning moves
   over, it gets `api/mealPlanning/`. A component imports **only** its own feature
   folder, never another feature's.
2. **Every file opens with a header comment** stating: which component it serves,
   which backend routes it calls, what it caches and for how long. If you cannot
   write that comment in five lines, the file is doing too much.
3. **`api/core/` holds shared primitives with no feature knowledge:**
   `request.ts` (typed wrapper over `services/authedFetch.ts` returning a
   discriminated `ApiResult<T>`) and `cache.ts` (TTL + LRU + in-flight dedupe).
   Nothing in `core/` may import from a feature folder.
4. **One exported function per backend route.** Mapping raw hits to view-models
   lives in a sibling `*.mappers.ts`, types in `*.types.ts`, tests next to them.
5. **No heuristics in api files.** No keyword lists, brand tables, image guessing
   or title-similarity fallbacks. Those belong server-side, or nowhere.
6. **Failures are values, never `[]` or `null`.** `ApiResult` distinguishes
   `throttled | offline | timeout | unauthorized | not_found | server | aborted`
   so screens can render the honest state (ERROR_LOG Errors 032, 063, 065).
7. **Caches never store failures**, are bounded, carry a versioned key prefix,
   and dedupe in-flight requests (ERROR_LOG Errors 059, 064, 065).

## Layout

```
api/
  README.md
  core/
    request.ts            authedFetch → ApiResult<T>, AbortSignal, timeout
    cache.ts              TTL + LRU + in-flight dedupe; memory-only unless opted in
  addFood/
    addFoodApi.ts         searchCatalogFoods(), toFoodCards(), toLoggableFood()
    addFoodApi.types.ts   CatalogFoodHit, CatalogSearchResponse, FoodCardVM, LoggableFood
    addFoodApi.mappers.ts toFoodCardVM(), buildTitleAndChips(), formatGrams(), formatServing()
    addFoodApi.mappers.test.ts
  barcode/
    barcodeApi.ts         lookupBarcode(), submitBarcodeReport()
    barcodeApi.types.ts   BarcodeHit (a CatalogFoodHit + barcode + every serving), report shapes
    barcodeApi.mappers.ts serving choice + quantity, the report form, toLoggableScannedFood()
    barcodeApi.test.ts
  core/
    cache.test.ts

utils/energy.ts         the ONE place energy is converted/formatted (kJ display, kcal storage)
```

## Tests

`npm test` runs `node --experimental-strip-types --test` over `api/**/*.test.ts` and
`utils/**/*.test.ts`. No Jest: the files under test are pure TypeScript with no React
Native imports, so Node's built-in runner is enough and starts in under a second. Keep it
that way: anything that needs React Native belongs in a component, not in `api/`.
Test files import siblings with the `.ts` extension (`tsconfig.json` allows it).

A file the test runner loads must use `.ts` on its **runtime** imports too, because
Node's ESM resolver does not guess extensions; type-only imports are erased and need
nothing. `api/barcode/barcodeApi.mappers.ts` is the first source file to do this, and
Metro was checked against it directly (a probe bundle resolved the specifiers) rather
than assumed. Keep runtime imports out of a `*.mappers.ts` where you can: a mapper with
none is testable no matter what the resolver does.

## Gotchas

- **A "not found" is a SUCCESS, not a failure.** `lookupBarcode` resolves `ok: true`
  with `data.found === false` when the catalogue and Open Food Facts both miss, because
  that is the answer the report form is for. Read `result.ok` first and `data.found`
  second; collapsing them is the mistake ERROR_LOG 063 and 065 describe.
- **Narrow `ApiResult` with `result.ok === false`, not `!result.ok`.** This project's
  `tsconfig` extends Expo's base, which does not enable `strict`, so `strictNullChecks`
  is off and TypeScript will not narrow a discriminated union by truthiness. Equality
  narrowing works. (Found 2026-09-18 wiring the modal; turning `strict` on is a separate
  project-wide job.)

## Migration map (old layer → `api/`)

Strategy decided 2026-09-18: **freeze, then strangle.** The old files keep running until
their last importer is gone. No big-bang rewrite, no keeping them forever. An export is
deleted from `services/mealAPI.tsx` only when `grep` for it returns zero hits; the file,
then `backend/src/routes/fatsecret.js`, then the FatSecret credentials go last, in that order.
Update this table in the same commit as each migration (checklist Phase 7).

| Consumer | Old imports | Target | Status |
|---|---|---|---|
| `components/addfoodmodal.tsx` | ~~`mealAPI: searchFoodItems, getFoodById`~~ · ~~`barcodeAPI: fetchBarcodeData`~~ | `api/addFood/` · `api/barcode/` | **DONE.** Search 2026-09-18, barcode 2026-09-23. This file imports no frozen module at all and came off the ESLint allowlist on 2026-09-25. |
| `components/VoiceSearchModal.tsx` | `mealAPI: searchFoodItems, searchRecipes` | `api/addFood/` (foods) · `api/recipes/` (recipes) | not started |
| ~~`services/barcodeAPI.tsx`~~ (live Open Food Facts) | — | `api/barcode/` via `GET /api/catalog/foods/barcode/:code` | **DELETED 2026-09-25** at zero importers (checklist b7-01, b7-02). The live OFF call did not disappear, it moved server-side as a fallback: `backend/src/services/offLive.js`. |
| `app/(tabs)/meal/recipe/index.tsx` | `mealAPI: searchRecipes` | `api/recipes/` | not started (own design pass first) |
| `app/(tabs)/meal/recipedetail.tsx` | `mealAPI: getRecipeDetails` · `themealdbAPI` | `api/recipes/` | not started |
| `app/(tabs)/meal/explore.tsx` | `themealdbAPI: getCuisines, getDishesByCuisine` | `api/recipes/` (catalog categories) | not started |
| `app/(tabs)/meal/comboDetail.tsx` | `mealAPI: fetchFoodDetailForFacts, buildNutritionFactsFromFood, getRecipeDetails` | `api/recommendations/` | not started (last) |
| `services/recommendation.ts` + `mealAPI.combos.ts` | `mealAPI: resolveFoodImageFromFatSecret, searchFoodItems, getFoodById` | `api/recommendations/` | not started (last; backend engine is its own workstream) |

Frozen files (header comment + ESLint `no-restricted-imports` allowlist, see checklist p7-01/p7-02):
`services/mealAPI.tsx`, `services/recommendation.ts`, `services/mealAPI.combos.ts`.
One down: `services/barcodeAPI.tsx` was deleted on 2026-09-25, and its ESLint pattern went with it.
A guard over a file that no longer exists is noise, and the thing it guarded against is now impossible.
Not frozen, still the right foundation: `services/authedFetch.ts`, `services/*Store.ts`,
`services/recipeNutrition.ts`, `services/mealLogOutcome.ts`.

Plan and progress: `claude_memory/database redesign/add food api redesign/ADD_FOOD_API_CHECKLIST.html`.
