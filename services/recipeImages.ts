import { authedFetch, type GetToken } from './authedFetch';

export interface UploadRecipeImageOptions {
  dataUri: string;
  getToken?: GetToken;
  clerkId?: string | null;
}

/** Uploads a recipe photo (as a base64 data URI) and returns the hosted URL. */
export async function uploadRecipeImage({
  dataUri,
  getToken,
  clerkId,
}: UploadRecipeImageOptions): Promise<string> {
  const response = await authedFetch('/api/favorites/upload-image', {
    method: 'POST',
    getToken,
    clerkId,
    body: JSON.stringify({ imageBase64: dataUri }),
    timeoutMs: 30_000,
  });

  if (!response.ok) {
    let message = `Upload failed: ${response.status}`;
    try {
      const errorData = await response.json();
      message = errorData.error || message;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.url) {
    throw new Error('Upload response missing url');
  }
  return data.url as string;
}
