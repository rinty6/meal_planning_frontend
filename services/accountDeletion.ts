import { authedFetch } from "./authedFetch";

type DeleteAccountArgs = {
  apiURL?: string;
  clerkId?: string | null;
  getToken?: (() => Promise<string | null>) | null;
};

type DeleteAccountResult = {
  ok: boolean;
  status: number;
  payload: any;
  error?: string;
  code?: string;
};

const cleanText = (value: unknown) => String(value ?? "").trim();

const normalizeApiUrl = (value: unknown) => cleanText(value).replace(/\/$/, "");

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

const getDeleteAccountErrorMessage = ({
  error,
  code,
}: {
  error?: string | null;
  code?: string | null;
}) => {
  switch (code) {
    case "MISSING_AUTHENTICATED_USER":
      return "Your signed-in session could not be confirmed. Please sign in again before deleting your account.";
    case "USER_NOT_FOUND":
      return "We could not find your app account. Please contact support if this continues.";
    case "CLERK_SERVER_UNAVAILABLE":
      return "Account deletion is temporarily unavailable because the server is missing its account provider configuration.";
    case "CLERK_ACCOUNT_DELETE_FAILED":
      return "Your app data was processed, but the account provider could not finish deleting the sign-in account. Please try again.";
    default:
      return error || "We could not delete your account right now. Please try again.";
  }
};

export const deleteCurrentAccount = async ({
  apiURL,
  clerkId,
  getToken,
}: DeleteAccountArgs): Promise<DeleteAccountResult> => {
  const normalizedApiUrl = normalizeApiUrl(apiURL);
  const normalizedClerkId = cleanText(clerkId);

  if (!normalizedApiUrl || !normalizedClerkId) {
    return {
      ok: false,
      status: 0,
      payload: null,
      code: "INVALID_DELETE_ACCOUNT_REQUEST",
      error: "Missing backend URL or signed-in user id.",
    };
  }

  try {
    const response = await authedFetch("/api/users/me", {
      method: "DELETE",
      baseUrl: normalizedApiUrl,
      clerkId: normalizedClerkId,
      getToken,
      headers: { "Content-Type": "application/json" },
    });

    const payload = await parseResponsePayload(response);
    const responseError = payload?.error || `Server returned ${response.status}`;

    return {
      ok: response.ok,
      status: response.status,
      payload,
      code: payload?.code,
      error: response.ok
        ? undefined
        : getDeleteAccountErrorMessage({
            error: responseError,
            code: payload?.code,
          }),
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      payload: null,
      code: "DELETE_ACCOUNT_NETWORK_ERROR",
      error: error?.message || "Failed to contact the backend.",
    };
  }
};
