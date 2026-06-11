import { readAsStringAsync } from 'expo-file-system/legacy';
import { authedFetch, type GetToken } from './authedFetch';

export interface NutritionInfo {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  serving_description: string | null;
}

export interface FoodCandidate {
  class_name: string;
  display_name: string;
  confidence: number;
  nutrition: NutritionInfo | null;
}

export interface PredictionResult {
  top_prediction: FoodCandidate;
  alternatives: FoodCandidate[];
  ood_detected: boolean;
  ood_message: string | null;
}

export interface FoodRecognitionAuthOptions {
  getToken?: GetToken;
  clerkId?: string | null;
}

const imageUriToBase64DataUrl = async (imageUri: string): Promise<string> => {
  const base64String = await readAsStringAsync(imageUri, {
    encoding: 'base64',
  });
  return `data:image/jpeg;base64,${base64String}`;
};

export async function recognizeFood(
  imageUri: string,
  auth: FoodRecognitionAuthOptions = {},
): Promise<PredictionResult> {
  const imageBase64 = await imageUriToBase64DataUrl(imageUri);

  const response = await authedFetch('/api/food-recognition/predict', {
    method: 'POST',
    getToken: auth.getToken,
    clerkId: auth.clerkId,
    body: JSON.stringify({ imageBase64 }),
    timeoutMs: 45_000,
  });

  if (!response.ok) {
    let message = `Recognition failed: ${response.status}`;
    try {
      const errorData = await response.json();
      message = errorData.error || errorData.detail || message;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json();
}
