import React from "react";
import { Image as ExpoImage } from "expo-image";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import Food3DIcon from "./Food3DIcon";

type MostConsumedFoodsStripProps = {
  items: any[];
  onPressItem?: (item: any) => void;
};

// 2026-11-24, option A of MOST_EATEN_STRIP_DESIGN.html (user decision): round
// photos like the plate cards, a small count on the photo, the name below.
// No other text. A tap opens the item's `usual_plate` (the Australian food
// page) when the server sent one.
const PHOTO = 64;

const MostConsumedFoodsStrip = ({ items, onPressItem }: MostConsumedFoodsStripProps) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }} contentContainerStyle={{ gap: 14, paddingTop: 6 }}>
      {items.map((item, index) => {
        const count = Math.round(Number(item?.count || item?.number_appearance || 0));
        const title = String(item?.title || item?.food_name || "Food");
        return (
          <TouchableOpacity
            key={`${title}-${index}`}
            style={{ width: 68, alignItems: "center" }}
            activeOpacity={0.85}
            onPress={() => onPressItem?.(item?.usual_plate || item)}
            accessibilityRole="button"
            accessibilityLabel={`${title}, eaten ${count} times`}
          >
            <View style={{ width: PHOTO, height: PHOTO, marginBottom: 6 }}>
              <View
                style={{
                  width: PHOTO,
                  height: PHOTO,
                  borderRadius: PHOTO / 2,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#fff",
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#0B2149",
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 4,
                }}
              >
                {item?.image ? (
                  <ExpoImage source={{ uri: item.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" transition={120} />
                ) : (
                  <Food3DIcon name={title} size={30} />
                )}
              </View>
              {count > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    backgroundColor: "#0B2149",
                    borderRadius: 999,
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderWidth: 2,
                    borderColor: "#fff",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{count}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#0B2149", maxWidth: 68 }} numberOfLines={1}>
              {title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

export default MostConsumedFoodsStrip;
