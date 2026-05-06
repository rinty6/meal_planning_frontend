const FOOD_API_URL = process.env.EXPO_PUBLIC_FOOD_API_URL;

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

export async function recognizeFood(imageUri: string): Promise<PredictionResult> {
  const formData = new FormData();
  formData.append("file", {
    uri: imageUri,
    type: "image/jpeg",
    name: "food.jpg",
  } as any);

  const response = await fetch(`${FOOD_API_URL}/predict`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Recognition failed: ${response.status}`);
  }

  return response.json();
}
