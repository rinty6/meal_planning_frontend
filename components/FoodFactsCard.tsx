import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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

const DVChip = ({ dv }: { dv?: number }) => {
  if (dv === undefined) return null;
  return (
    <Text
      className="text-xs font-bold text-textSecondary bg-neutralSoft rounded-lg text-center"
      style={{ minWidth: 40, paddingVertical: 3, paddingHorizontal: 9 }}
    >
      {dv}%
    </Text>
  );
};

const SubRow = ({
  label,
  value,
  unit,
  dv,
}: {
  label: string;
  value: any;
  unit: string;
  dv?: number;
}) => (
  <View
    className="flex-row items-center justify-between"
    style={{ paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#F1F4F8" }}
  >
    <Text style={{ fontSize: 15, color: "#6B7280" }}>{label}</Text>
    <View className="flex-row items-center" style={{ gap: 14 }}>
      <Text className="font-semibold text-deep" style={{ fontSize: 15 }}>{formatValue(value, unit)}</Text>
      <DVChip dv={dv} />
    </View>
  </View>
);

const NutrientGroup = ({
  icon,
  iconColor,
  chipBg,
  title,
  value,
  valueSize = 17,
  dv,
  children,
}: {
  icon: any;
  iconColor: string;
  chipBg: string;
  title: string;
  value?: string;
  valueSize?: number;
  dv?: number;
  children?: React.ReactNode;
}) => (
  <View className="bg-white border border-borderSoft rounded-2xl mb-3.5" style={{ paddingHorizontal: 18, paddingVertical: 16 }}>
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <View
        className="items-center justify-center rounded-xl"
        style={{ width: 38, height: 38, backgroundColor: chipBg }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text className="flex-1 font-bold text-deep" style={{ fontSize: 16 }}>{title}</Text>
      {value !== undefined && (
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <Text className="font-semibold text-deep" style={{ fontSize: valueSize }}>{value}</Text>
          <DVChip dv={dv} />
        </View>
      )}
    </View>
    {children ? <View style={{ marginTop: 8 }}>{children}</View> : null}
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
    <View className="bg-white border border-borderSoft rounded-2xl p-4 mb-8">
      <Text className="text-base font-bold text-deep mb-3">Detailed Facts</Text>
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

  const vitaminItems = [
    { label: "Vitamin D", value: n.vitaminD?.value ?? 0, unit: n.vitaminD?.unit || "mcg", dv: n.vitaminD?.dv ?? 0 },
    { label: "Calcium", value: n.calcium?.value ?? 0, unit: n.calcium?.unit || "mg", dv: n.calcium?.dv ?? 0 },
    { label: "Iron", value: n.iron?.value ?? 0, unit: n.iron?.unit || "mg", dv: n.iron?.dv ?? 0 },
    { label: "Potassium", value: n.potassium?.value ?? 0, unit: n.potassium?.unit || "mg", dv: n.potassium?.dv ?? 0 },
    { label: "Vitamin A", value: n.vitaminA?.value ?? 0, unit: n.vitaminA?.unit || "mcg", dv: n.vitaminA?.dv ?? 0 },
    { label: "Vitamin C", value: n.vitaminC?.value ?? 0, unit: n.vitaminC?.unit || "mg", dv: n.vitaminC?.dv ?? 0 },
  ];

  return (
    <View className="mb-8">
      <View className="flex-row items-end justify-between" style={{ marginBottom: 14 }}>
        <Text className="font-extrabold text-deep" style={{ fontSize: 21, letterSpacing: -0.3 }}>Nutrition Facts</Text>
        <Text style={{ fontSize: 13, color: "#9AA7BD" }}>Serving size · {n.servingDescription || "1 serving"}</Text>
      </View>

      <View
        className="bg-primarySoft rounded-2xl flex-row items-center justify-between"
        style={{ paddingHorizontal: 20, paddingVertical: 18, marginBottom: 14 }}
      >
        <View>
          <Text className="font-bold text-primary" style={{ fontSize: 12, letterSpacing: 1.2 }}>CALORIES</Text>
          <Text style={{ fontSize: 13, color: "#5B6B8C", marginTop: 2 }}>Amount per serving</Text>
        </View>
        <Text className="font-extrabold text-deep" style={{ fontSize: 46, letterSpacing: -1 }}>
          {Math.round(Number(n.calories || 0))}
        </Text>
      </View>

      <NutrientGroup
        icon="water"
        iconColor="#FF9500"
        chipBg="#FFF2E0"
        title="Total Fat"
        value={formatValue(n.fat?.value ?? 0, "g")}
        dv={n.fat?.dv ?? 0}
      >
        <SubRow label="Saturated Fat" value={n.saturatedFat?.value ?? 0} unit="g" dv={n.saturatedFat?.dv ?? 0} />
        <SubRow label="Trans Fat" value={n.transFat?.value ?? 0} unit="g" />
        <SubRow label="Polyunsaturated" value={n.polyunsaturatedFat ?? 0} unit="g" />
        <SubRow label="Monounsaturated" value={n.monounsaturatedFat ?? 0} unit="g" />
      </NutrientGroup>

      <NutrientGroup
        icon="nutrition-outline"
        iconColor="#007BFF"
        chipBg="#E7F1FF"
        title="Total Carbohydrate"
        value={formatValue(n.carbs?.value ?? 0, "g")}
        dv={n.carbs?.dv ?? 0}
      >
        <SubRow label="Dietary Fiber" value={n.fiber?.value ?? 0} unit="g" dv={n.fiber?.dv ?? 0} />
        <SubRow label="Sugars" value={n.sugar ?? 0} unit="g" />
        <SubRow label="Includes Added Sugars" value={n.addedSugars?.value ?? 0} unit="g" dv={n.addedSugars?.dv ?? 0} />
      </NutrientGroup>

      <NutrientGroup
        icon="barbell-outline"
        iconColor="#10B981"
        chipBg="#DFF7EF"
        title="Protein"
        value={formatValue(n.protein?.value ?? 0, "g")}
        valueSize={20}
      />

      <NutrientGroup
        icon="heart-outline"
        iconColor="#5B6B8C"
        chipBg="#EEF2F6"
        title="Cholesterol & Sodium"
      >
        <SubRow label="Cholesterol" value={n.cholesterol?.value ?? 0} unit="mg" dv={n.cholesterol?.dv ?? 0} />
        <SubRow label="Sodium" value={n.sodium?.value ?? 0} unit="mg" dv={n.sodium?.dv ?? 0} />
      </NutrientGroup>

      <NutrientGroup
        icon="sparkles-outline"
        iconColor="#FF9500"
        chipBg="#FFF2E0"
        title="Vitamins & Minerals"
      >
        {vitaminItems.map((vitamin) => (
          <SubRow key={vitamin.label} label={vitamin.label} value={vitamin.value} unit={vitamin.unit} dv={vitamin.dv} />
        ))}
      </NutrientGroup>

      <Text style={{ fontSize: 11.5, lineHeight: 17, color: "#9AA7BD", marginTop: 2 }}>
        * Percent Daily Values are based on a 2,000 calorie diet.
      </Text>
    </View>
  );
};

export default FoodFactsCard;
