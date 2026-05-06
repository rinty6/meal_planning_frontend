const FOOD_API_URL = process.env.EXPO_PUBLIC_FOOD_API_URL;

export interface FeedbackPayload {
  imageUri: string | null;
  predictedClass: string;
  correctClass: string;
}

export async function submitFoodFeedback(payload: FeedbackPayload): Promise<void> {
  const formData = new FormData();

  if (payload.imageUri) {
    formData.append('file', {
      uri: payload.imageUri,
      type: 'image/jpeg',
      name: 'feedback.jpg',
    } as any);
  }

  formData.append('predicted_class', payload.predictedClass);
  formData.append('correct_class', payload.correctClass);

  // Best-effort — caller should not throw on failure
  await fetch(`${FOOD_API_URL}/feedback`, {
    method: 'POST',
    body: formData,
  });
}
