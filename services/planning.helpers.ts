export type MealType = "breakfast" | "lunch" | "dinner";

export type RecommendationItem = {
  id: string;
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  grams: number;
  image: string;
  type: string;
  role?: string | null;
  explanation?: string;
};

export type RecommendationCombo = {
  id: string;
  combo_id: string;
  mealType: MealType;
  title: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  time: string;
  image: string;
  explanation: string;
  behavioral_insight: string;
  ml_tag: string;
  slot_target: number;
  items: RecommendationItem[];
};

export type MostConsumedItem = {
  id?: string;
  food_id?: string;
  fatsecret_food_id?: string;
  title: string;
  food_name: string;
  meal_type: string;
  count: number;
  number_appearance: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  grams?: number;
  image: string;
};

export type CombosByMeal = Record<MealType, RecommendationCombo[]>;

export const LOADING_MESSAGES = [
  "Analyzing your eating patterns...",
  "Mapping your calorie goals...",
  "Balancing macros for your next meals...",
  "Selecting diverse options for variety...",
];

const toNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalNumber = (value: any) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const createEmptyCombosByMeal = (): CombosByMeal => ({ breakfast: [], lunch: [], dinner: [] });

export const normalizeExternalId = (item: any) => {
  const rawId = item?.externalId ?? item?.id ?? item?.foodId ?? item?.food_id;
  if (rawId !== undefined && rawId !== null && String(rawId).trim() !== "") return String(rawId);
  const title = String(item?.title || item?.foodName || "item")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return `title:${title}`;
};

export const comboMapKey = (combo: any, index: number, mealType: MealType) =>
  String(combo?.id || combo?.combo_id || `${mealType}-${index}-${combo?.title || "combo"}`);

export const normalizeItem = (item: any, index: number): RecommendationItem => ({
  id: String(item?.id || item?.food_id || `item-${index}`),
  title: item?.title || item?.food_name || "Meal Item",
  calories: Math.max(0, Math.round(toNumber(item?.cals ?? item?.calories, 0))),
  protein: Math.round(toNumber(item?.protein, 0) * 10) / 10,
  carbs: Math.round(toNumber(item?.carbs, 0) * 10) / 10,
  fats: Math.round(toNumber(item?.fats, 0) * 10) / 10,
  grams: Math.max(40, Math.round(toNumber(item?.grams, 100))),
  image: item?.image || "",
  type: item?.type || "food",
  role: item?.role || null,
  explanation: item?.explanation || "",
});

export const normalizeCombo = (combo: any, mealType: MealType, index: number): RecommendationCombo | null => {
  const slotItems = combo?.combo
    ? [combo?.combo?.main, combo?.combo?.side1, combo?.combo?.side2].filter(Boolean)
    : [];
  const directItems = Array.isArray(combo?.items) ? combo.items : [];
  const rawItems = directItems.length > 0 ? directItems : slotItems;
  if (rawItems.length === 0) return null;

  const items = rawItems.map((item: any, itemIndex: number) => normalizeItem(item, itemIndex));
  const totalCalories = Number(
    combo?.totalCalories ??
      combo?.total_calories ??
      items.reduce((sum: number, item: RecommendationItem) => sum + Number(item.calories || 0), 0)
  );
  const totalProtein = Number(
    combo?.totalProtein ??
      combo?.total_protein ??
      items.reduce((sum: number, item: RecommendationItem) => sum + Number(item.protein || 0), 0)
  );
  const totalCarbs = Number(
    combo?.totalCarbs ??
      combo?.total_carbs ??
      items.reduce((sum: number, item: RecommendationItem) => sum + Number(item.carbs || 0), 0)
  );
  const totalFats = Number(
    combo?.totalFats ??
      combo?.total_fats ??
      items.reduce((sum: number, item: RecommendationItem) => sum + Number(item.fats || 0), 0)
  );

  const comboId = String(combo?.id || combo?.combo_id || `${mealType}-${index}`);
  return {
    ...combo,
    id: comboId,
    combo_id: comboId,
    mealType,
    title:
      combo?.title ||
      items
        .slice(0, 4)
        .map((item) => item.title)
        .filter(Boolean)
        .join(" + ") ||
      "Recommended Meal",
    totalCalories: Math.round(totalCalories),
    totalProtein: Math.round(totalProtein * 10) / 10,
    totalCarbs: Math.round(totalCarbs * 10) / 10,
    totalFats: Math.round(totalFats * 10) / 10,
    time: combo?.time || "20 min",
    image: combo?.image || items.find((item) => item.image)?.image || "",
    explanation: combo?.explanation || combo?.behavioral_insight || "",
    behavioral_insight: combo?.behavioral_insight || combo?.explanation || "",
    ml_tag: combo?.ml_tag || "",
    slot_target: Number(combo?.slot_target || combo?.slotTarget || 0),
    items,
  };
};

export const normalizeMostConsumedItem = (item: any): MostConsumedItem => ({
  id: String(item?.id || item?.food_id || "").trim(),
  food_id: String(item?.food_id || item?.id || "").trim(),
  fatsecret_food_id: String(item?.fatsecret_food_id || "").trim(),
  title: item?.title || item?.food_name || "Food Item",
  food_name: item?.food_name || item?.title || "Food Item",
  meal_type: item?.meal_type || "",
  count: Math.max(0, Math.round(toNumber(item?.count ?? item?.number_appearance, 0))),
  number_appearance: Math.max(0, Math.round(toNumber(item?.number_appearance ?? item?.count, 0))),
  calories:
    toOptionalNumber(item?.calories ?? item?.cals ?? item?.serving_calories ?? item?.dataset_serving_calories) === undefined
      ? undefined
      : Math.max(
          0,
          Math.round(toOptionalNumber(item?.calories ?? item?.cals ?? item?.serving_calories ?? item?.dataset_serving_calories) || 0)
        ),
  protein:
    toOptionalNumber(item?.protein ?? item?.serving_protein ?? item?.dataset_serving_protein) === undefined
      ? undefined
      : Math.round(
          (toOptionalNumber(item?.protein ?? item?.serving_protein ?? item?.dataset_serving_protein) || 0) * 10
        ) / 10,
  carbs:
    toOptionalNumber(item?.carbs ?? item?.serving_carbs ?? item?.dataset_serving_carbs) === undefined
      ? undefined
      : Math.round(
          (toOptionalNumber(item?.carbs ?? item?.serving_carbs ?? item?.dataset_serving_carbs) || 0) * 10
        ) / 10,
  fats:
    toOptionalNumber(item?.fats ?? item?.fat ?? item?.serving_fats ?? item?.dataset_serving_fats) === undefined
      ? undefined
      : Math.round(
          (toOptionalNumber(item?.fats ?? item?.fat ?? item?.serving_fats ?? item?.dataset_serving_fats) || 0) * 10
        ) / 10,
  grams:
    toOptionalNumber(item?.grams ?? item?.serving_amount ?? item?.serving_grams ?? item?.metric_serving_amount) === undefined
      ? undefined
      : Math.max(
          0,
          Math.round(toOptionalNumber(item?.grams ?? item?.serving_amount ?? item?.serving_grams ?? item?.metric_serving_amount) || 0)
        ),
  image: item?.image || "",
});

export const hasAnyCombos = (combosByMeal: CombosByMeal) =>
  (combosByMeal.breakfast?.length || 0) + (combosByMeal.lunch?.length || 0) + (combosByMeal.dinner?.length || 0) > 0;

const SAFETY_LIST_TEMPLATE: Record<MealType, any[]> = {
  breakfast: [
    {
      id: "local-safety-breakfast-1",
      title: "Greek Yogurt + Berries + Almonds",
      totalCalories: 330,
      totalProtein: 22.2,
      totalCarbs: 24.3,
      totalFats: 10.3,
      time: "10 min",
      explanation: "Safety fallback with balanced breakfast macros.",
      ml_tag: "Safety",
      items: [
        { id: "safety-1", title: "Greek Yogurt", calories: 100, protein: 17, carbs: 6, fats: 0, grams: 170, image: "", type: "food" },
        { id: "safety-2", title: "Mixed Berries", calories: 57, protein: 1, carbs: 14, fats: 0, grams: 100, image: "", type: "food" },
        { id: "safety-3", title: "Almonds", calories: 173, protein: 4.2, carbs: 4.3, fats: 10, grams: 30, image: "", type: "food" },
      ],
    },
  ],
  lunch: [
    {
      id: "local-safety-lunch-1",
      title: "Grilled Chicken + Brown Rice + Broccoli",
      totalCalories: 545,
      totalProtein: 63.5,
      totalCarbs: 47,
      totalFats: 7.5,
      time: "20 min",
      explanation: "Safety fallback with lean protein and fiber-rich carbs.",
      ml_tag: "Safety",
      items: [
        { id: "safety-4", title: "Grilled Chicken Breast", calories: 297, protein: 56, carbs: 0, fats: 6, grams: 180, image: "", type: "food" },
        { id: "safety-5", title: "Brown Rice", calories: 188, protein: 4, carbs: 39, fats: 1.5, grams: 170, image: "", type: "food" },
        { id: "safety-6", title: "Steamed Broccoli", calories: 60, protein: 3.5, carbs: 8, fats: 0.5, grams: 170, image: "", type: "food" },
      ],
    },
  ],
  dinner: [
    {
      id: "local-safety-dinner-1",
      title: "Salmon + Sweet Potato + Salad",
      totalCalories: 520,
      totalProtein: 36.7,
      totalCarbs: 38,
      totalFats: 22.4,
      time: "20 min",
      explanation: "Safety fallback focused on omega-3 fats and complex carbs.",
      ml_tag: "Safety",
      items: [
        { id: "safety-7", title: "Grilled Salmon", calories: 353, protein: 34, carbs: 0, fats: 22, grams: 170, image: "", type: "food" },
        { id: "safety-8", title: "Sweet Potato", calories: 146, protein: 2.7, carbs: 34, fats: 0.2, grams: 170, image: "", type: "food" },
        { id: "safety-9", title: "Mixed Salad", calories: 21, protein: 0, carbs: 4, fats: 0.2, grams: 120, image: "", type: "food" },
      ],
    },
  ],
};

export const cloneSafetyList = (): CombosByMeal => ({
  breakfast: (SAFETY_LIST_TEMPLATE.breakfast || [])
    .map((combo, index) => normalizeCombo({ ...combo }, "breakfast", index))
    .filter(Boolean) as RecommendationCombo[],
  lunch: (SAFETY_LIST_TEMPLATE.lunch || [])
    .map((combo, index) => normalizeCombo({ ...combo }, "lunch", index))
    .filter(Boolean) as RecommendationCombo[],
  dinner: (SAFETY_LIST_TEMPLATE.dinner || [])
    .map((combo, index) => normalizeCombo({ ...combo }, "dinner", index))
    .filter(Boolean) as RecommendationCombo[],
});
