// Shared authenticated-fetch helper for backend API calls.
//
// Centralizes Clerk token attachment so every protected request sends
// `Authorization: Bearer <token>`. During the auth-migration window we also keep
// sending `x-clerk-id` for backward compatibility, but the backend treats the
// verified Bearer token as the source of truth (the header is non-authoritative).
//
// Usage:
//   const res = await authedFetch("/api/meals/recent/" + clerkId, { getToken, clerkId });
//   const data = await res.json();

import { API_URL } from "../utils/config";

export type GetToken = (() => Promise<string | null>) | null | undefined;

const cleanText = (value: unknown) => String(value ?? "").trim();
const normalizeBaseUrl = (value: unknown) => cleanText(value).replace(/\/+$/, "");

export type AuthedFetchOptions = Omit<RequestInit, "headers"> & {
  getToken?: GetToken;
  /**
   * Sent as `x-clerk-id` for backward compatibility during the auth migration.
   * Identity is verified server-side from the Bearer token; this is not trusted
   * as proof of identity.
   */
  clerkId?: string | null;
  headers?: Record<string, string>;
  /** Abort the request after this many ms (only applied when no caller `signal` is given). */
  timeoutMs?: number;
  /** Override the backend base URL (defaults to EXPO_PUBLIC_BACKEND_URL). */
  baseUrl?: string;
};

export const resolveApiUrl = (path: string, baseUrl?: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const base = normalizeBaseUrl(baseUrl ?? API_URL);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
};

export const buildAuthHeaders = async ({
  getToken,
  clerkId,
  headers,
  hasJsonBody,
}: {
  getToken?: GetToken;
  clerkId?: string | null;
  headers?: Record<string, string>;
  hasJsonBody?: boolean;
}): Promise<Record<string, string>> => {
  const result: Record<string, string> = { ...(headers || {}) };

  const hasContentType = Object.keys(result).some(
    (key) => key.toLowerCase() === "content-type"
  );
  if (hasJsonBody && !hasContentType) {
    result["Content-Type"] = "application/json";
  }

  const normalizedClerkId = cleanText(clerkId);
  if (normalizedClerkId && !result["x-clerk-id"]) {
    result["x-clerk-id"] = normalizedClerkId;
  }

  try {
    const token = (await getToken?.()) || null;
    if (token) {
      result.Authorization = `Bearer ${token}`;
    }
  } catch {
    // If token retrieval fails, send the request without it. Protected routes
    // will respond 401 and the caller handles that path.
  }

  return result;
};

export const authedFetch = async (
  path: string,
  options: AuthedFetchOptions = {}
): Promise<Response> => {
  const { getToken, clerkId, headers, timeoutMs, baseUrl, body, signal, ...rest } =
    options;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const finalHeaders = await buildAuthHeaders({
    getToken,
    clerkId,
    headers,
    hasJsonBody: body != null && !isFormData,
  });

  const url = resolveApiUrl(path, baseUrl);

  // Run the request with a per-attempt timeout (only when the caller did not
  // supply its own signal).
  const runFetch = async (): Promise<Response> => {
    let controller: AbortController | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (
      !signal &&
      typeof timeoutMs === "number" &&
      timeoutMs > 0 &&
      typeof AbortController === "function"
    ) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller?.abort(), timeoutMs);
    }
    try {
      return await fetch(url, {
        ...rest,
        body,
        headers: finalHeaders,
        signal: signal ?? controller?.signal ?? undefined,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  let response = await runFetch();

  // One gentle backoff-retry on 429 (rate limited). A 429 means the request was
  // not processed, so re-sending is safe. Honor Retry-After, capped at 3s. Skip
  // when the caller manages its own signal or sent a FormData body.
  if (response.status === 429 && !signal && !isFormData) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After"));
    const waitMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 1000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 3000)));
    response = await runFetch();
  }

  return response;
};
