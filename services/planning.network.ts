import { authedFetch, type GetToken } from "./authedFetch";

export type AddMealPayload = {
  apiURL: string;
  clerkId: string;
  getToken?: GetToken;
  date: string;
  mealType: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  image?: string;
  externalId?: string;
  source?: string;
  servingId?: string;
  servingDescription?: string;
  nutrients?: Record<string, any>;
};

export type MealPlanPreferences = {
  allergens: string[];
  diets: string[];
  nutrientLimits: Record<string, { min?: number; max?: number }>;
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
  const { apiURL, getToken, ...bodyPayload } = payload;
  const response = await authedFetch(`/api/meals/add`, {
    method: "POST",
    baseUrl: apiURL,
    getToken,
    clerkId: bodyPayload.clerkId,
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
  getToken,
}: {
  apiURL: string;
  clerkId: string;
  limit?: number;
  getToken?: GetToken;
}): Promise<any[]> => {
  if (!apiURL || !clerkId) return [];
  try {
    const response = await authedFetch(
      `/api/meals/most-consumed/${encodeURIComponent(clerkId)}?limit=${limit}`,
      { baseUrl: apiURL, getToken, clerkId, cache: "no-store" }
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

  const { apiURL, clerkId, date, mealType, getToken } = inputs[0];
  const response = await authedFetch(`/api/meals/add-batch`, {
    method: "POST",
    baseUrl: apiURL,
    getToken,
    clerkId,
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
        externalId: input.externalId || "",
        source: input.source || "",
        servingId: input.servingId || "",
        servingDescription: input.servingDescription || "",
        nutrients: input.nutrients || {},
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

export const fetchMealPlanPreferences = async ({
  apiURL,
  clerkId,
  getToken,
}: {
  apiURL: string;
  clerkId: string;
  getToken?: GetToken;
}) => {
  const response = await authedFetch(`/api/meal-plan/preferences/${encodeURIComponent(clerkId)}`, {
    baseUrl: apiURL,
    getToken,
    clerkId,
  });
  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || "Could not fetch meal plan preferences");
  }
  return data;
};

export const saveMealPlanPreferences = async ({
  apiURL,
  clerkId,
  preferences,
  getToken,
}: {
  apiURL: string;
  clerkId: string;
  preferences: MealPlanPreferences;
  getToken?: GetToken;
}) => {
  const response = await authedFetch(`/api/meal-plan/preferences/${encodeURIComponent(clerkId)}`, {
    method: "PUT",
    baseUrl: apiURL,
    getToken,
    clerkId,
    body: JSON.stringify({ preferences }),
  });
  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || "Could not save meal plan preferences");
  }
  return data;
};

export const fetchMealPlanRecommendations = async ({
  apiURL,
  clerkId,
  date,
  mealType,
  forceExploration = false,
  explorationSeed,
  preferences,
  getToken,
}: {
  apiURL: string;
  clerkId: string;
  date: string;
  mealType?: string;
  forceExploration?: boolean;
  explorationSeed?: string | number;
  preferences?: MealPlanPreferences;
  getToken?: GetToken;
}) => {
  const params = new URLSearchParams({ date });
  if (mealType) params.set("mealType", mealType);
  if (forceExploration) params.set("force_exploration", "true");
  if (explorationSeed !== undefined) params.set("exploration_seed", String(explorationSeed));
  if (preferences) params.set("preferences", JSON.stringify(preferences));
  const response = await authedFetch(
    `/api/meal-plan/recommendations/${encodeURIComponent(clerkId)}?${params.toString()}`,
    { baseUrl: apiURL, getToken, clerkId, cache: "no-store" }
  );
  const data = await readResponseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || "Could not fetch meal plan recommendations");
  }
  return data;
};

export const sendMealPlanEvent = async ({
  apiURL,
  clerkId,
  eventType,
  mealType,
  item,
  items,
  preferences,
  context,
  getToken,
}: {
  apiURL?: string;
  clerkId?: string | null;
  eventType: "shown" | "selected" | "unselected" | "accepted" | "skipped" | "loved" | "shuffled";
  mealType?: string;
  item?: any;
  items?: any[];
  preferences?: MealPlanPreferences;
  context?: Record<string, any>;
  getToken?: GetToken;
}) => {
  if (!apiURL || !clerkId) return false;
  try {
    const response = await authedFetch(`/api/meal-plan/events`, {
      method: "POST",
      baseUrl: apiURL,
      getToken,
      clerkId,
      body: JSON.stringify({
        clerkId,
        eventType,
        mealType,
        item,
        items,
        preferences,
        context,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};
