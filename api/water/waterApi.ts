/**
 * api/water/waterApi.ts — the water row on Home and Meal Summary (checklist m6-02).
 *
 * Serves: components/WaterRow.tsx, used by app/(tabs)/index.tsx and app/(tabs)/meal/summary.tsx.
 * Calls:  GET /api/water/:clerkId?date=, POST /api/water/add,
 *         DELETE /api/water/:clerkId/last?date=, DELETE /api/water/:clerkId/:id
 *         (backend/src/routes/water.js). Every answer is the whole day's state.
 * Caches: nothing. One small row per screen focus; writes must never be served stale.
 *
 * Narrow failures with `result.ok === false` (api/README.md: strictNullChecks is off).
 */

import { requestJson, type ApiResult } from "../core/request";
import type { GetToken } from "../../services/authedFetch";

export type WaterDay = {
  date: string;
  targetMl: number;
  totalMl: number;
  glassesMl: number;
  drinksMl: number;
  /** The glass the minus button takes back; null when there is none. */
  lastGlassId: number | null;
  /** Only on POST: the new glass, for the Undo. */
  addedId?: number | null;
};

export type WaterRequestOptions = { getToken?: GetToken; clerkId?: string | null; signal?: AbortSignal };

export const fetchWaterDay = (date: string, options: WaterRequestOptions = {}): Promise<ApiResult<WaterDay>> =>
  requestJson<WaterDay>(`/api/water/${encodeURIComponent(options.clerkId || "")}`, {
    query: { date },
    getToken: options.getToken,
    clerkId: options.clerkId,
    signal: options.signal,
  });

/** One glass (the server defaults to 250 ml). A write: never retried blindly. */
export const addWaterGlass = (date: string, options: WaterRequestOptions = {}): Promise<ApiResult<WaterDay>> =>
  requestJson<WaterDay>("/api/water/add", {
    method: "POST",
    body: { clerkId: options.clerkId, date },
    getToken: options.getToken,
    clerkId: options.clerkId,
    retryOnThrottle: false,
  });

/** Takes back the newest glass of the day (the minus button). */
export const removeLastWaterGlass = (date: string, options: WaterRequestOptions = {}): Promise<ApiResult<WaterDay>> =>
  requestJson<WaterDay>(`/api/water/${encodeURIComponent(options.clerkId || "")}/last`, {
    method: "DELETE",
    query: { date },
    getToken: options.getToken,
    clerkId: options.clerkId,
    retryOnThrottle: false,
  });

/** Removes one glass by id (the Undo after a +). */
export const removeWaterGlass = (id: number, options: WaterRequestOptions = {}): Promise<ApiResult<WaterDay>> =>
  requestJson<WaterDay>(`/api/water/${encodeURIComponent(options.clerkId || "")}/${id}`, {
    method: "DELETE",
    getToken: options.getToken,
    clerkId: options.clerkId,
    retryOnThrottle: false,
  });
