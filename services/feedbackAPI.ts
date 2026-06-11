import { readAsStringAsync } from 'expo-file-system/legacy';
import { authedFetch, type GetToken } from './authedFetch';

export interface FeedbackPayload {
  imageUri: string | null;
  predictedClass: string;
  correctClass: string;
  getToken?: GetToken;
  clerkId?: string | null;
}

const imageUriToBase64DataUrl = async (imageUri: string): Promise<string> => {
  const base64String = await readAsStringAsync(imageUri, {
    encoding: 'base64',
  });
  return `data:image/jpeg;base64,${base64String}`;
};

export async function submitFoodFeedback(payload: FeedbackPayload): Promise<void> {
  const imageBase64 = payload.imageUri
    ? await imageUriToBase64DataUrl(payload.imageUri)
    : undefined;

  // Best-effort - caller should not throw on failure.
  await authedFetch('/api/food-recognition/feedback', {
    method: 'POST',
    getToken: payload.getToken,
    clerkId: payload.clerkId,
    body: JSON.stringify({
      imageBase64,
      predictedClass: payload.predictedClass,
      correctClass: payload.correctClass,
    }),
    timeoutMs: 30_000,
  });
}
