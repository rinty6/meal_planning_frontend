import React from "react";
import { View, Text, ScrollView, Image } from "react-native";

import Food3DIcon from "./Food3DIcon";

interface MostConsumedStripProps {
  items: any[];
}

const MostConsumedStrip = ({ items }: MostConsumedStripProps) => {
  if (!items || items.length === 0) return null;

  return (
    <View className="mb-6">
      <Text className="text-lg font-bold mb-3">Most Consumed Foods</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {items.map((item, index) => (
          <View key={`${item.title}-${index}`} className="mr-3 w-28">
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
            <Text className="text-[11px] text-gray-500">{item.count} times</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default MostConsumedStrip;

