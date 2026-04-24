export interface MealCombo {
  id: string;
  title: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  time: string;
  items: any[];
}

type ComboResolvers = {
  searchFoodItems: (query: string, maxResults?: number) => Promise<any[]>;
  getFoodById: (foodId: string) => Promise<any | null>;
  totalCombos?: number;
};

const MAIN_KEYWORDS = ["Chicken", "Rice", "Salmon", "Steak", "Tofu", "Banh Mi", "Noodles", "Salad"];
const SIDE_KEYWORDS = ["Banana", "Apple", "Yogurt", "Almonds", "Orange", "Grapes"];
const DRINK_KEYWORDS = ["Coffee", "Tea", "Milk", "Juice"];

const randomKeyword = (values: string[]) => values[Math.floor(Math.random() * values.length)];

const buildComboTitle = (items: any[]) =>
  `${items[0].title} + ${items[1].title.split(",")[0]} + ${items[2].title.split(",")[0]}`;

export const generateMealCombosWithResolvers = async ({
  searchFoodItems,
  getFoodById,
  totalCombos = 5,
}: ComboResolvers): Promise<MealCombo[]> => {
  const combos: MealCombo[] = [];

  for (let i = 0; i < totalCombos; i++) {
    try {
      const [mainRes, sideRes, drinkRes] = await Promise.all([
        searchFoodItems(randomKeyword(MAIN_KEYWORDS), 1).then((res) => (res[0] ? getFoodById(res[0].id) : null)),
        searchFoodItems(randomKeyword(SIDE_KEYWORDS), 1).then((res) => (res[0] ? getFoodById(res[0].id) : null)),
        searchFoodItems(randomKeyword(DRINK_KEYWORDS), 1).then((res) => (res[0] ? getFoodById(res[0].id) : null)),
      ]);

      const items = [mainRes, sideRes, drinkRes].filter((item) => item !== null);
      if (items.length < 3) continue;

      const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
      const totalProtein = items.reduce((sum, item) => sum + item.protein, 0);
      const totalCarbs = items.reduce((sum, item) => sum + item.carbs, 0);
      const totalFats = items.reduce((sum, item) => sum + item.fats, 0);

      combos.push({
        id: `combo-${Date.now()}-${i}`,
        title: buildComboTitle(items),
        totalCalories: Math.round(totalCalories),
        totalProtein: parseFloat(totalProtein.toFixed(1)),
        totalCarbs: parseFloat(totalCarbs.toFixed(1)),
        totalFats: parseFloat(totalFats.toFixed(1)),
        time: "15 min",
        items,
      });
    } catch (error) {
      console.error("Single Combo Gen Error:", error);
    }
  }

  return combos;
};
