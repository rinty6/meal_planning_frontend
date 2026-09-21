/**
 * api/core/request.ts — the transport every api/<feature>/ file uses.
 *
 * Serves: every feature folder under api/. No feature knowledge lives here.
 * Calls: the GoodHealthMate backend (EXPO_PUBLIC_BACKEND_URL) through
 *        services/authedFetch.ts, which attaches the Clerk Bearer token.
 * Caches: nothing. Caching is api/core/cache.ts, per feature.
 *
 * Why it exists: the old layer collapsed every failure into `null` / `[]`, so a
 * 429 rendered as "No match" (ERROR_LOG 063) and a failed load rendered the
 * wrong screen (ERROR_LOG 065). requestJson() returns a discriminated
 * ApiResult so the screen can render the honest state. It also gives every
 * request a timeout and an AbortSignal, so a superseded search is cancelled
 * rather than raced (the modal's request-id guard only ignored stale results;
 * the request itself kept the OS connection pool busy, ERROR_LOG 064).
 */

import { authedFetch, type GetToken } from "../../services/authedFetch";

export type ApiFailureKind =
  | "throttled" // 429: the request never ran; retry after a pause
  | "offline" // no network / DNS / connection refused
  | "timeout" // our own timeout fired
  | "unauthorized" // 401 / 403
  | "not_found" // 404
  | "bad_request" // 400: our input was rejected; retrying identically will not help
  | "server" // 5xx or unparseable success body
  | "aborted"; // the caller's AbortSignal fired (a newer request superseded this one)

export type ApiFailure = {
  ok: false;
  kind: ApiFailureKind;
  status: number; // 0 when no response was received
  retryable: boolean;
  message: string;
};

export type ApiSuccess<T> = { ok: true; data: T; status: number };

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** An ApiResult annotated with where it came from. Written as a union so `if (!r.ok)` narrows. */
export type CachedApiResult<T> = (ApiSuccess<T> & { fromCache: boolean }) | (ApiFailure & { fromCache: boolean });

export type QueryValue = string | number | boolean | null | undefined | (string | number)[];

export type RequestOptions = {
  getToken?: GetToken;
  clerkId?: string | null;
  /** Query-string parameters. Arrays repeat the key: { segment: ["a","b"] } → ?segment=a&segment=b */
  query?: Record<string, QueryValue>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Caller's cancellation. Superseding a search should abort the old one. */
  signal?: AbortSignal;
  /** Default 12 s: long enough for a cold Railway container, short enough to show an honest state. */
  timeoutMs?: number;
  /** Retry once on 429, honouring Retry-After (capped). Default true. */
  retryOnThrottle?: boolean;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRY_AFTER_MS = 3_000;

export const buildQueryString = (query: Record<string, QueryValue> | undefined): string => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
};

const failure = (kind: ApiFailureKind, status: number, message: string, retryable: boolean): ApiFailure => ({
  ok: false,
  kind,
  status,
  retryable,
  message,
});

const kindForStatus = (status: number): ApiFailureKind => {
  if (status === 429) return "throttled";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "bad_request";
  return "server";
};

const isRetryableStatus = (status: number) => status === 429 || status === 503 || status === 502 || status === 504;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    }, { once: true });
  });

/**
 * Perform an authenticated JSON request and classify the outcome.
 * Never throws for an expected failure; a thrown error here is a bug.
 */
export const requestJson = async <T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> => {
  const {
    getToken,
    clerkId,
    query,
    method = "GET",
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryOnThrottle = true,
  } = options;

  if (signal?.aborted) return failure("aborted", 0, "Request cancelled.", false);

  const url = `${path}${buildQueryString(query)}`;

  // One controller drives fetch; it is tripped by our timeout OR the caller's
  // signal. `timedOut` tells the two apart afterwards.
  const runAttempt = async (): Promise<{ response: Response } | ApiFailure> => {
    const controller = new AbortController();
    let timedOut = false;
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener("abort", onCallerAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await authedFetch(url, {
        method,
        getToken,
        clerkId,
        signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { response };
    } catch (error: unknown) {
      if (signal?.aborted) return failure("aborted", 0, "Request cancelled.", false);
      if (timedOut) return failure("timeout", 0, "The request took too long.", true);
      const message = error instanceof Error ? error.message : String(error);
      return failure("offline", 0, message || "Network request failed.", true);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  };

  let attempt = await runAttempt();

  if ("ok" in attempt && attempt.ok === false) return attempt;
  let { response } = attempt as { response: Response };

  // A 429 means the request was never processed, so one re-send is safe.
  // Mirrors authedFetch's own retry, which is skipped when a signal is given.
  if (response.status === 429 && retryOnThrottle && !signal?.aborted) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After"));
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 1000;
    await sleep(Math.min(waitMs, MAX_RETRY_AFTER_MS), signal);
    if (signal?.aborted) return failure("aborted", 0, "Request cancelled.", false);
    attempt = await runAttempt();
    if ("ok" in attempt && attempt.ok === false) return attempt;
    response = (attempt as { response: Response }).response;
  }

  let parsed: unknown = null;
  let parseFailed = false;
  try {
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parseFailed = true;
  }

  if (!response.ok) {
    const serverMessage =
      parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `Request failed (${response.status}).`;
    const serverSaysRetryable =
      parsed && typeof parsed === "object" && (parsed as { retryable?: unknown }).retryable === true;
    return failure(
      kindForStatus(response.status),
      response.status,
      serverMessage,
      serverSaysRetryable === true || isRetryableStatus(response.status),
    );
  }

  if (parseFailed) return failure("server", response.status, "The server returned an unreadable response.", true);

  return { ok: true, data: parsed as T, status: response.status };
};
