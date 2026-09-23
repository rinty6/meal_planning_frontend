/**
 * api/barcode/barcodeApi.ts — data for the Add Food modal's barcode scanner.
 *
 * Serves: components/addfood/Barcode*.tsx, driven by components/addfoodmodal.tsx.
 * Calls:  GET  /api/catalog/foods/barcode/:code  (catalogue, then a live Open
 *              Food Facts fallback on our side)
 *         POST /api/catalog/barcode/reports      (what the user typed off a pack
 *              we do not hold)
 *         POST /api/favorites/upload-image       (the photo of the nutrition
 *              panel, into the barcode-reports folder the backend allows)
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
  queueReport,
  reportServing,
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
  queueReport,
  reportServing,
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

/**
 * Upload the photo of a nutrition panel and return its hosted URL.
 *
 * Goes through the same endpoint as recipe photos, with the folder the backend
 * allowlist maps to goodhealthmate/barcode-reports, so a panel snapshot never
 * lands among users' recipe images.
 *
 * The photo is optional evidence. A failure here is reported to the caller so
 * it can say the attachment did not stick, and it must never block Send.
 */
export const uploadReportPhoto = async (
  dataUri: string,
  options: BarcodeRequestOptions = {},
): Promise<ApiResult<{ url: string }>> =>
  requestJson<{ url: string }>("/api/favorites/upload-image", {
    method: "POST",
    body: { imageBase64: dataUri, folder: "barcode-reports" },
    getToken: options.getToken,
    clerkId: options.clerkId,
    signal: options.signal,
    // A photo is bigger than a JSON body and rides a slower path.
    timeoutMs: 30_000,
    retryOnThrottle: false,
  });

/**
 * Reports whose send failed, waiting for the next one to carry them along.
 *
 * In memory only, and that is the decision, not an omission: a report is our
 * catalogue's gain, not the user's data, so losing one on a cold start costs
 * us a product and costs them nothing. Persisting it would mean an outbox to
 * maintain and a user-visible failure to explain for something they were never
 * told about (checklist b5-05).
 */
let pendingReports: BarcodeReportPayload[] = [];

/** Test hook and diagnostics. Never rendered. */
export const pendingReportCount = () => pendingReports.length;
export const clearReportQueue = () => {
  pendingReports = [];
};

/**
 * Send a report, carrying any earlier failures with it.
 *
 * Resolves with the result of THIS report only. The caller ignores it: the
 * user's meal log is what the card reports on, and a report that did not land
 * is never surfaced (checklist b5-05).
 */
export const submitBarcodeReportQueued = async (
  payload: BarcodeReportPayload,
  options: BarcodeRequestOptions = {},
): Promise<ApiResult<BarcodeReportResponse>> => {
  // Drain first, so the retry rides the connection we already know is up.
  const waiting = pendingReports;
  pendingReports = [];
  for (const queued of waiting) {
    const retried = await submitBarcodeReport(queued, options);
    if (retried.ok === false) pendingReports = queueReport(pendingReports, queued);
  }

  const result = await submitBarcodeReport(payload, options);
  // `bad_request` is the server refusing these numbers; retrying cannot fix it.
  if (result.ok === false && result.kind !== "bad_request" && result.kind !== "aborted") {
    pendingReports = queueReport(pendingReports, payload);
  }
  return result;
};

/**
 * Test hook. Deliberately NOT called when the scanner closes: the whole point
 * of the 10-minute window is that re-scanning the same pack in one shopping
 * trip costs nothing.
 */
export const clearBarcodeCaches = () => lookupCache.clear();
