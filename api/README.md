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
    addFoodApi.ts         searchCatalogFoods(), toMealLogPayload()
    addFoodApi.types.ts   CatalogFoodHit, CatalogSearchResponse, FoodCardVM
    addFoodApi.mappers.ts toFoodCardVM(), formatEnergyKj(), formatGrams(), formatServing()
    addFoodApi.mappers.test.ts
```

## Migration map (old layer → `api/`)

Strategy decided 2026-09-18: **freeze, then strangle.** The old files keep running until
their last importer is gone. No big-bang rewrite, no keeping them forever. An export is
deleted from `services/mealAPI.tsx` only when `grep` for it returns zero hits; the file,
then `backend/src/routes/fatsecret.js`, then the FatSecret credentials go last, in that order.
Update this table in the same commit as each migration (checklist Phase 7).

| Consumer | Old imports | Target | Status |
|---|---|---|---|
| `components/addfoodmodal.tsx` | `mealAPI: searchFoodItems, getFoodById` · `barcodeAPI: fetchBarcodeData` | `api/addFood/` | in progress (this pass: search; barcode in Phase 6) |
| `components/VoiceSearchModal.tsx` | `mealAPI: searchFoodItems, searchRecipes` | `api/addFood/` (foods) · `api/recipes/` (recipes) | not started |
| `services/barcodeAPI.tsx` (live Open Food Facts) | — | `api/addFood/` via `GET /api/catalog/foods/barcode/:code` | not started |
| `app/(tabs)/meal/recipe/index.tsx` | `mealAPI: searchRecipes` | `api/recipes/` | not started (own design pass first) |
| `app/(tabs)/meal/recipedetail.tsx` | `mealAPI: getRecipeDetails` · `themealdbAPI` | `api/recipes/` | not started |
| `app/(tabs)/meal/explore.tsx` | `themealdbAPI: getCuisines, getDishesByCuisine` | `api/recipes/` (catalog categories) | not started |
| `app/(tabs)/meal/comboDetail.tsx` | `mealAPI: fetchFoodDetailForFacts, buildNutritionFactsFromFood, getRecipeDetails` | `api/recommendations/` | not started (last) |
| `services/recommendation.ts` + `mealAPI.combos.ts` | `mealAPI: resolveFoodImageFromFatSecret, searchFoodItems, getFoodById` | `api/recommendations/` | not started (last; backend engine is its own workstream) |

Frozen files (header comment + ESLint `no-restricted-imports` allowlist, see checklist p7-01/p7-02):
`services/mealAPI.tsx`, `services/recommendation.ts`, `services/barcodeAPI.tsx`, `services/mealAPI.combos.ts`.
Not frozen, still the right foundation: `services/authedFetch.ts`, `services/*Store.ts`,
`services/recipeNutrition.ts`, `services/mealLogOutcome.ts`.

Plan and progress: `claude_memory/database redesign/add food api redesign/ADD_FOOD_API_CHECKLIST.html`.
