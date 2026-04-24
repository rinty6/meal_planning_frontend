import React from "react";
import { View, Text, FlatList } from "react-native";

import ComboCard from "./ComboCard";

type MealType = "breakfast" | "lunch" | "dinner";

interface MealTimelineSectionProps {
  mealType: MealType;
  items: any[];
  cardWidth: number;
  cardGap: number;
  snapInterval: number;
  onAddItem: (item: any, mealType: MealType) => void;
  onSkipItem: (item: any, itemIndex: number, mealType: MealType) => void;
  onPressItem: (item: any) => void;
}

const comboKey = (item: any, index: number, mealType: MealType) =>
  String(item?.id || item?.item_id || `${mealType}-${index}-${item?.title || "item"}`);

const MealTimelineSection = ({
  mealType,
  items,
  cardWidth,
  cardGap,
  snapInterval,
  onAddItem,
  onSkipItem,
  onPressItem,
}: MealTimelineSectionProps) => {
  return (
    <View className="mb-8">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-bold capitalize">{mealType}</Text>
        <Text className="text-xs text-gray-500">{items.length} option(s)</Text>
      </View>

      {items.length > 0 ? (
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, index) => comboKey(item, index, mealType)}
          snapToInterval={snapInterval}
          snapToAlignment="start"
          decelerationRate="fast"
          nestedScrollEnabled
          contentContainerStyle={{ paddingRight: 20 }}
          ItemSeparatorComponent={() => <View style={{ width: cardGap }} />}
          renderItem={({ item, index }) => {
            return (
              <View style={{ width: cardWidth }}>
                <ComboCard
                  item={item}
                  onAdd={() => onAddItem(item, mealType)}
                  onSkip={() => onSkipItem(item, index, mealType)}
                  onPress={() => onPressItem(item)}
                />
              </View>
            );
          }}
        />
      ) : (
        <Text className="text-gray-400">No recommendations available for {mealType}.</Text>
      )}
    </View>
  );
};

export default MealTimelineSection;
