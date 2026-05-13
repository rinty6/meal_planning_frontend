export const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Build the public privacy policy route from the configured backend base URL.
export const PRIVACY_POLICY_URL = API_URL?.trim()
	? `${API_URL.trim().replace(/\/+$/, '')}/privacy-policy`
	: undefined;
