/**
 * api/addFood/addFoodApi.ts — data for the Add Food modal.
 *
 * Serves: components/addfoodmodal.tsx (search view) and components/addfood/*.
 * Calls:  GET /api/catalog/foods/search (backend/src/routes/catalog.js), the
 *         self-owned catalogue. Replaces the FatSecret proxy calls
 *         searchFoodItems + getFoodById from the frozen services/mealAPI.tsx.
 * Caches: search responses in memory for 10 minutes, 30 entries, keyed by
 *         normalised query + selected facets + source + offset; identical
 *         concurrent searches share one request. Nothing is persisted.
 *
 * One export per backend route (searchCatalogFoods) plus the two mappings the
 * modal needs on the way in (toFoodCardVM) and out (toLoggableFood). Adding a
 * food needs NO second request: every hit already carries its default serving
 * and nutrition profile (checklist p0-04; ERROR_LOG 071 documented the 3–4 s
 * window the old two-step flow created).
 */

import { TtlCache } from "../core/cache";
import { requestJson, type ApiResult } from "../core/request";
import type { GetToken } from "../../services/authedFetch";
import { toFoodCardVM, toLoggableFood } from "./addFoodApi.mappers";
import type { CatalogSearchParams, CatalogSearchResponse, FoodCardVM } from "./addFoodApi.types";

export { toFoodCardVM, toLoggableFood };
export type * from "./addFoodApi.types";

const SEARCH_ROUTE = "/api/catalog/foods/search";
export const SEARCH_LIMIT_DEFAULT = 20;

const searchCache = new TtlCache<CatalogSearchResponse>({
  name: "addFood.search",
  version: 1,
  ttlMs: 10 * 60 * 1000,
  maxEntries: 30,
});

const normaliseParams = (params: CatalogSearchParams) => ({
  query: params.query.trim().replace(/\s+/g, " ").toLowerCase(),
  segments: Array.from(new Set((params.segments ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean))).sort(),
  source: params.source ?? null,
  limit: params.limit ?? SEARCH_LIMIT_DEFAULT,
  offset: params.offset ?? 0,
});

export const buildSearchCacheKey = (params: CatalogSearchParams): string => {
  const p = normaliseParams(params);
  return `${p.query}|${p.segments.join(",")}|${p.source ?? ""}|${p.limit}|${p.offset}`;
};

export type SearchCatalogFoodsOptions = {
  getToken?: GetToken;
  clerkId?: string | null;
  /** Abort when a newer search supersedes this one. */
  signal?: AbortSignal;
};

export type CatalogSearchResult = ApiResult<CatalogSearchResponse> & { fromCache: boolean };

/**
 * Search the catalogue. Returns a discriminated result; never throws for an
 * expected failure and never turns a failure into an empty list.
 */
export const searchCatalogFoods = async (
  params: CatalogSearchParams,
  options: SearchCatalogFoodsOptions = {},
): Promise<CatalogSearchResult> => {
  const normalised = normaliseParams(params);
  if (!normalised.query) {
    return { ok: false, kind: "bad_request", status: 0, retryable: false, message: "Type something to search.", fromCache: false };
  }

  return searchCache.getOrFetch(
    buildSearchCacheKey(params),
    (signal) =>
      requestJson<CatalogSearchResponse>(SEARCH_ROUTE, {
        getToken: options.getToken,
        clerkId: options.clerkId,
        signal,
        query: {
          q: normalised.query,
          segment: normalised.segments,
          source: normalised.source,
          limit: normalised.limit,
          offset: normalised.offset,
        },
      }),
    { signal: options.signal },
  );
};

/** Convenience for the modal: hits → cards in one call. */
export const toFoodCards = (response: CatalogSearchResponse): FoodCardVM[] => response.items.map(toFoodCardVM);

/** Test hook. */
export const clearAddFoodCaches = () => searchCache.clear();
