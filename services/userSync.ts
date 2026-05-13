type BootstrapBackendUserArgs = {
  apiURL?: string;
  clerkId?: string | null;
  getToken?: (() => Promise<string | null>) | null;
};

export type BootstrapBackendUserResult = {
  ok: boolean;
  status: number;
  payload: any;
  error?: string;
  code?: string;
};

const cleanText = (value: unknown) => String(value ?? "").trim();

const normalizeApiUrl = (value: unknown) => cleanText(value).replace(/\/$/, "");

const BOOTSTRAP_REQUEST_TIMEOUT_MS = 60_000;
const BOOTSTRAP_REQUEST_TIMEOUT_SECONDS = Math.round(
  BOOTSTRAP_REQUEST_TIMEOUT_MS / 1000
);
const inFlightBootstrapRequests = new Map<
  string,
  Promise<BootstrapBackendUserResult>
>();

const parseResponsePayload = async (response: Response) => {
  try {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  } catch {
    return null;
  }
};

export const getBootstrapErrorMessage = ({
  error,
  code,
}: {
  error?: string | null;
  code?: string | null;
}) => {
  switch (code) {
    case "PRIMARY_EMAIL_REQUIRED":
      return "Your account is missing a primary email address in Clerk, so the app cannot finish setup yet.";
    case "USER_IDENTITY_CONFLICT":
      return "We found conflicting account records for this user. This account needs cleanup before setup can continue.";
    case "CLERK_USER_NOT_FOUND":
      return "The signed-in user could not be loaded from Clerk. Please sign out and try again.";
    case "CLERK_SERVER_UNAVAILABLE":
      return "The backend is missing Clerk server configuration, so account setup cannot finish yet.";
    case "USER_NOT_BOOTSTRAPPED":
      return "Your account is signed in, but the app profile has not been created yet. Please retry setup.";
    default:
      return error || "We could not finish account setup. Please try again.";
  }
};

const runBootstrapBackendUserRequest = async ({
  apiURL,
  clerkId,
  getToken,
}: BootstrapBackendUserArgs): Promise<BootstrapBackendUserResult> => {
  const normalizedApiUrl = normalizeApiUrl(apiURL);
  const normalizedClerkId = cleanText(clerkId);

  if (!normalizedApiUrl || !normalizedClerkId) {
    return {
      ok: false,
      status: 0,
      payload: null,
      code: "INVALID_BOOTSTRAP_REQUEST",
      error: "Missing backend URL or Clerk user id.",
    };
  }

  try {
    const token = (await getToken?.()) || null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-clerk-id": normalizedClerkId,
    };
    // Bound the startup bootstrap request so the app cannot spin forever.
    const abortController =
      typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      abortController?.abort();
    }, BOOTSTRAP_REQUEST_TIMEOUT_MS);

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;

    try {
      response = await fetch(`${normalizedApiUrl}/api/users/bootstrap`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: abortController?.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const payload = await parseResponsePayload(response);

    return {
      ok: response.ok,
      status: response.status,
      payload,
      code: payload?.code,
      error: response.ok
        ? undefined
        : getBootstrapErrorMessage({
            error: payload?.error || `Server returned ${response.status}`,
            code: payload?.code,
          }),
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        status: 0,
        payload: null,
        code: "BOOTSTRAP_TIMEOUT",
        error:
          `The app could not finish account setup because the backend did not respond within ${BOOTSTRAP_REQUEST_TIMEOUT_SECONDS} seconds.`,
      };
    }

    return {
      ok: false,
      status: 0,
      payload: null,
      code: "BOOTSTRAP_NETWORK_ERROR",
      error: error?.message || "Failed to contact the backend.",
    };
  }
};

export const bootstrapBackendUser = async ({
  apiURL,
  clerkId,
  getToken,
}: BootstrapBackendUserArgs): Promise<BootstrapBackendUserResult> => {
  const normalizedApiUrl = normalizeApiUrl(apiURL);
  const normalizedClerkId = cleanText(clerkId);

  if (!normalizedApiUrl || !normalizedClerkId) {
    return {
      ok: false,
      status: 0,
      payload: null,
      code: "INVALID_BOOTSTRAP_REQUEST",
      error: "Missing backend URL or Clerk user id.",
    };
  }

  const requestKey = `${normalizedApiUrl}|${normalizedClerkId}`;
  const existingRequest = inFlightBootstrapRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  // Reuse the same in-flight bootstrap request so startup retries do not duplicate work.
  const pendingRequest = runBootstrapBackendUserRequest({
    apiURL: normalizedApiUrl,
    clerkId: normalizedClerkId,
    getToken,
  });
  inFlightBootstrapRequests.set(requestKey, pendingRequest);

  try {
    return await pendingRequest;
  } finally {
    if (inFlightBootstrapRequests.get(requestKey) === pendingRequest) {
      inFlightBootstrapRequests.delete(requestKey);
    }
  }
};
