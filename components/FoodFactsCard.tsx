import React from "react";
import { Text, View } from "react-native";

interface FoodFactsCardProps {
  item: any;
  nutritionFacts?: any;
}

const formatValue = (value: any, unit: string) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return `0${unit}`;

  if (unit === "g") return `${numeric.toFixed(2)}${unit}`;
  if (unit === "mg" || unit === "mcg") {
    const rounded = Math.round(numeric);
    if (Math.abs(numeric - rounded) < 0.001) return `${rounded}${unit}`;
    return `${numeric.toFixed(2)}${unit}`;
  }
  return `${numeric.toFixed(2)}${unit}`;
};

const NutritionRow = ({
  label,
  value,
  unit,
  dv,
  bold = false,
  indent = false,
  thick = false,
}: {
  label: string;
  value: any;
  unit: string;
  dv?: number;
  bold?: boolean;
  indent?: boolean;
  thick?: boolean;
}) => (
  <View className={`flex-row items-center justify-between py-1.5 ${thick ? "border-t-2" : "border-t"} border-gray-400`}>
    <Text className={`${indent ? "pl-4" : ""} ${bold ? "font-bold text-black" : "text-gray-800"}`}>{label}</Text>
    <View className="flex-row items-center">
      <Text className={`${bold ? "font-bold text-black" : "text-gray-800"}`}>{formatValue(value, unit)}</Text>
      {dv !== undefined && <Text className="font-bold text-black ml-4 min-w-[36px] text-right">{dv}%</Text>}
    </View>
  </View>
);

const FactsFallback = ({ item }: { item: any }) => {
  const allergens = Array.isArray(item?.allergens)
    ? item.allergens
        .filter((a: any) => String(a?.value) === "1" || a?.value === 1)
        .map((a: any) => a?.name)
        .filter(Boolean)
    : [];

  const preferences = Array.isArray(item?.preferences)
    ? item.preferences
        .filter((p: any) => String(p?.value) === "1" || p?.value === 1)
        .map((p: any) => p?.name)
        .filter(Boolean)
    : [];

  const categories = Array.isArray(item?.food_sub_categories) ? item.food_sub_categories.filter(Boolean) : [];

  return (
    <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-8">
      <Text className="text-base font-bold text-black mb-3">Detailed Facts</Text>
      {!!item?.food_type && (
        <View className="mb-2">
          <Text className="text-gray-400 text-xs uppercase">Food Type</Text>
          <Text className="text-gray-800 font-semibold">{item.food_type}</Text>
        </View>
      )}
      {!!item?.brand_name && (
        <View className="mb-2">
          <Text className="text-gray-400 text-xs uppercase">Brand</Text>
          <Text className="text-gray-800 font-semibold">{item.brand_name}</Text>
        </View>
      )}
      {!!item?.serving_description && (
        <View className="mb-2">
          <Text className="text-gray-400 text-xs uppercase">Serving</Text>
          <Text className="text-gray-800 font-semibold">{item.serving_description}</Text>
        </View>
      )}
      {categories.length > 0 && (
        <View className="mb-2">
          <Text className="text-gray-400 text-xs uppercase">Categories</Text>
          <Text className="text-gray-800 font-semibold">{categories.join(", ")}</Text>
        </View>
      )}
      {allergens.length > 0 && (
        <View className="mb-2">
          <Text className="text-gray-400 text-xs uppercase">Allergens</Text>
          <Text className="text-gray-800 font-semibold">{allergens.join(", ")}</Text>
        </View>
      )}
      {preferences.length > 0 && (
        <View className="mb-2">
          <Text className="text-gray-400 text-xs uppercase">Preferences</Text>
          <Text className="text-gray-800 font-semibold">{preferences.join(", ")}</Text>
        </View>
      )}
    </View>
  );
};

const FoodFactsCard = ({ item, nutritionFacts }: FoodFactsCardProps) => {
  if (!item) return null;
  if (!nutritionFacts) return <FactsFallback item={item} />;

  const n = nutritionFacts;

  return (
    <View className="bg-white border-2 border-black rounded-md p-4 mb-8">
      <Text className="text-3xl font-extrabold text-black">Nutrition Facts</Text>

      <View className="border-t-2 border-gray-500 mt-3 pt-2">
        <View className="flex-row items-center gap-2">
          <View>
            <Text className="text-2xl font-bold text-black">Serving Size:</Text>
          </View>
          <Text className="text-xl font-extrabold text-black flex-1 flex-wrap" numberOfLines={0}>
            {n.servingDescription || "1 serving"}
          </Text>
        </View>
      </View>

      <View className="border-t-2 border-gray-500 mt-2 pt-2">
        <Text className="text-xl font-bold text-black">Amount Per Serving</Text>
      </View>

      <View className="border-t border-gray-500 mt-2 pt-2 flex-row items-end justify-between">
        <Text className="text-5xl font-extrabold text-black">Calories</Text>
        <Text className="text-7xl font-extrabold text-black">{Math.round(Number(n.calories || 0))}</Text>
      </View>

      <View className="border-t-2 border-gray-500 mt-2 pt-1">
        <Text className="text-right text-2xl font-extrabold text-black">% Daily Values*</Text>
      </View>

      <NutritionRow label="Total Fat" value={n.fat?.value ?? 0} unit="g" dv={n.fat?.dv ?? 0} bold />
      <NutritionRow label="Saturated Fat" value={n.saturatedFat?.value ?? 0} unit="g" dv={n.saturatedFat?.dv ?? 0} indent />
      <NutritionRow label="Trans Fat" value={n.transFat?.value ?? 0} unit="g" indent />
      <NutritionRow label="Polyunsaturated Fat" value={n.polyunsaturatedFat ?? 0} unit="g" indent />
      <NutritionRow label="Monounsaturated Fat" value={n.monounsaturatedFat ?? 0} unit="g" indent />

      <NutritionRow label="Cholesterol" value={n.cholesterol?.value ?? 0} unit="mg" dv={n.cholesterol?.dv ?? 0} bold />
      <NutritionRow label="Sodium" value={n.sodium?.value ?? 0} unit="mg" dv={n.sodium?.dv ?? 0} bold />
      <NutritionRow label="Total Carbohydrate" value={n.carbs?.value ?? 0} unit="g" dv={n.carbs?.dv ?? 0} bold />
      <NutritionRow label="Dietary Fiber" value={n.fiber?.value ?? 0} unit="g" dv={n.fiber?.dv ?? 0} indent />
      <NutritionRow label="Sugars" value={n.sugar ?? 0} unit="g" indent />
      <NutritionRow label="Includes Added Sugars" value={n.addedSugars?.value ?? 0} unit="g" dv={n.addedSugars?.dv ?? 0} indent />

      <NutritionRow label="Protein" value={n.protein?.value ?? 0} unit="g" bold thick />

      <NutritionRow label="Vitamin D" value={n.vitaminD?.value ?? 0} unit={n.vitaminD?.unit || "mcg"} dv={n.vitaminD?.dv ?? 0} />
      <NutritionRow label="Calcium" value={n.calcium?.value ?? 0} unit={n.calcium?.unit || "mg"} dv={n.calcium?.dv ?? 0} />
      <NutritionRow label="Iron" value={n.iron?.value ?? 0} unit={n.iron?.unit || "mg"} dv={n.iron?.dv ?? 0} />
      <NutritionRow label="Potassium" value={n.potassium?.value ?? 0} unit={n.potassium?.unit || "mg"} dv={n.potassium?.dv ?? 0} />
      <NutritionRow label="Vitamin A" value={n.vitaminA?.value ?? 0} unit={n.vitaminA?.unit || "mcg"} dv={n.vitaminA?.dv ?? 0} />
      <NutritionRow label="Vitamin C" value={n.vitaminC?.value ?? 0} unit={n.vitaminC?.unit || "mg"} dv={n.vitaminC?.dv ?? 0} />

      <Text className="text-xs text-gray-600 mt-4">
        * Percent Daily Values are based on a 2,000 calorie diet.
      </Text>
    </View>
  );
};

export default FoodFactsCard;
