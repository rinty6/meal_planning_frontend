export type AddMealPayload = {
  apiURL: string;
  clerkId: string;
  date: string;
  mealType: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  image?: string;
};

type AddMealResponse = {
  success: boolean;
  message: string;
  reachedTarget: boolean;
  exceededLimit: boolean;
  dailyTotalCalories: number;
  dailyTarget: number;
  addedCount?: number;
  didExceedLimit?: boolean;
  didReachTarget?: boolean;
};

const readResponseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const addMealLog = async (payload: AddMealPayload) => {
  const { apiURL, ...bodyPayload } = payload;
  const response = await fetch(`${apiURL}/api/meals/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || "Could not add meal");
  }
  return data;
};

// Fallback for the "Most consumed foods" strip: when the ML service can't
// produce a history-based list (empty history_df / missing DB connectivity),
// Node can derive the same shape directly from meal_logs.
export const fetchMostConsumedFromMealLogs = async ({
  apiURL,
  clerkId,
  limit = 10,
}: {
  apiURL: string;
  clerkId: string;
  limit?: number;
}): Promise<any[]> => {
  if (!apiURL || !clerkId) return [];
  try {
    const response = await fetch(
      `${apiURL}/api/meals/most-consumed/${clerkId}?limit=${limit}`
    );
    if (!response.ok) return [];
    const data = await readResponseJson(response);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items;
  } catch {
    return [];
  }
};

export const addMealsBatch = async (inputs: AddMealPayload[]): Promise<AddMealResponse> => {
  if (inputs.length === 0) {
    throw new Error("No meals to add");
  }

  const { apiURL, clerkId, date, mealType } = inputs[0];
  const response = await fetch(`${apiURL}/api/meals/add-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clerkId,
      date,
      mealType,
      items: inputs.map((input) => ({
        foodName: input.foodName,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fats: input.fats,
        image: input.image || "",
      })),
    }),
  });

  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || "Could not add meals");
  }

  return {
    ...(data || {}),
    didExceedLimit: !!data?.exceededLimit,
    didReachTarget: !!data?.reachedTarget,
  };
};
