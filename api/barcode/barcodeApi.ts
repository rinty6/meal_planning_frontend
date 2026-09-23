/**
 * api/barcode/barcodeApi.ts — data for the Add Food modal's barcode scanner.
 *
 * Serves: components/addfood/Barcode*.tsx, driven by components/addfoodmodal.tsx.
 * Calls:  GET  /api/catalog/foods/barcode/:code  (catalogue, then a live Open
 *              Food Facts fallback on our side)
 *         POST /api/catalog/barcode/reports      (what the user typed off a pack
 *              we do not hold)
 *         Both in backend/src/routes/catalog.js. Replaces the direct
 *         openfoodfacts.org call in the frozen services/barcodeAPI.tsx.
 * Caches: lookups in memory for 10 minutes, 30 entries, keyed by the
 *         normalised digits. A miss is cached like a hit — a shelf of unknown
 *         packs should not be a shelf of requests — but a failure never is.
 *         Reports are writes and are never cached.
 *
 * Two contracts this file exists to hold:
 *
 *   1. `found: false` is a SUCCESS. It means the scanner should show the label
 *      report form. A failure (offline, throttled, server) is a different
 *      thing entirely and shows failure copy. Rendering either as the other is
 *      the bug ERROR_LOG 063 and 065 are about, so the two never share a path
 *      here: callers read `result.ok` first, and only then `data.found`.
 *   2. Sending a report must never be able to affect the user's own meal log.
 *      submitBarcodeReport resolves with a result the caller is free to
 *      ignore, and ignoring it is the intended behaviour on the scanner
 *      (checklist b0-09).
 *
 * Narrow failures with `result.ok === false`, not `!result.ok`:
 * strictNullChecks is off in this project so the bare negation does not narrow
 * (api/README.md).
 */

import { TtlCache } from "../core/cache";
import { requestJson, type ApiResult, type CachedApiResult } from "../core/request";
import type { GetToken } from "../../services/authedFetch";
import {
  MIN_BARCODE_LENGTH,
  normaliseBarcode,
  buildReportPayload,
  emptyReportForm,
  energyKjFor,
  findServing,
  isReportDirty,
  isReportSendable,
  missingReportFields,
  normaliseQuantity,
  servingChipLabel,
  servingKey,
  toLoggableReportedFood,
  toLoggableScannedFood,
  toScannedCardVM,
} from "./barcodeApi.mappers";
import type {
  BarcodeLookupResponse,
  BarcodeReportPayload,
  BarcodeReportResponse,
} from "./barcodeApi.types";

export {
  normaliseBarcode,
  buildReportPayload,
  emptyReportForm,
  energyKjFor,
  findServing,
  isReportDirty,
  isReportSendable,
  missingReportFields,
  normaliseQuantity,
  servingChipLabel,
  servingKey,
  toLoggableReportedFood,
  toLoggableScannedFood,
  toScannedCardVM,
};
export type * from "./barcodeApi.types";

const LOOKUP_ROUTE = "/api/catalog/foods/barcode";
const REPORT_ROUTE = "/api/catalog/barcode/reports";

const lookupCache = new TtlCache<BarcodeLookupResponse>({
  name: "barcode.lookup",
  version: 1,
  ttlMs: 10 * 60 * 1000,
  maxEntries: 30,
});

export type BarcodeRequestOptions = {
  getToken?: GetToken;
  clerkId?: string | null;
  signal?: AbortSignal;
};

export type BarcodeLookupResult = CachedApiResult<BarcodeLookupResponse>;

/**
 * Look a scanned code up. Resolves; it does not throw for an expected failure
 * and never turns one into "not found".
 */
export const lookupBarcode = async (
  rawCode: string,
  options: BarcodeRequestOptions = {},
): Promise<BarcodeLookupResult> => {
  const barcode = normaliseBarcode(rawCode);
  if (barcode.length < MIN_BARCODE_LENGTH) {
    return {
      ok: false,
      kind: "bad_request",
      status: 0,
      retryable: false,
      message: "That does not look like a barcode. Try scanning again.",
      fromCache: false,
    };
  }

  return lookupCache.getOrFetch(
    barcode,
    (signal) =>
      requestJson<BarcodeLookupResponse>(`${LOOKUP_ROUTE}/${barcode}`, {
        getToken: options.getToken,
        clerkId: options.clerkId,
        signal,
        // The catalogue query is fast; the OFF fallback is the slow half and
        // has its own 3 s cap on the server, so this only needs to outlast it.
        timeoutMs: 10_000,
      }),
    { signal: options.signal },
  );
};

/**
 * Send a label report.
 *
 * The caller has already logged the user's food by the time this runs. A
 * failure here is ours, not theirs: the scanner ignores the result and shows
 * the success card either way (checklist b0-09). It is returned rather than
 * swallowed so tests and __DEV__ logging can see it.
 */
export const submitBarcodeReport = async (
  payload: BarcodeReportPayload,
  options: BarcodeRequestOptions = {},
): Promise<ApiResult<BarcodeReportResponse>> =>
  requestJson<BarcodeReportResponse>(REPORT_ROUTE, {
    method: "POST",
    body: payload,
    getToken: options.getToken,
    clerkId: options.clerkId,
    signal: options.signal,
    // A report is a write: a blind retry could duplicate it. The upsert on
    // (barcode, reporter) makes that harmless, but not retrying keeps the
    // honest thing honest.
    retryOnThrottle: false,
  });

/** Test hook, and used when the modal closes so a re-scan re-reads. */
export const clearBarcodeCaches = () => lookupCache.clear();
