import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";

import Food3DIcon from "./Food3DIcon";

type MostConsumedFoodsStripProps = {
  items: any[];
  onPressItem?: (item: any) => void;
};

const MostConsumedFoodsStrip = ({ items, onPressItem }: MostConsumedFoodsStripProps) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
      {items.map((item, index) => (
        <TouchableOpacity
          key={`${item.title}-${index}`}
          className="mr-3 w-28"
          activeOpacity={0.85}
          onPress={() => onPressItem?.(item)}
        >
          <View className="w-28 h-20 rounded-xl bg-gray-100 overflow-hidden items-center justify-center">
            {item.image ? (
              <Image source={{ uri: item.image }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Food3DIcon name={item.title} size={30} />
            )}
          </View>
          <Text className="text-xs font-bold text-gray-800 mt-2" numberOfLines={2}>
            {item.title}
          </Text>
          <Text className="text-[11px] text-gray-500">{item.count || item.number_appearance || 0} times</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

export default MostConsumedFoodsStrip;
