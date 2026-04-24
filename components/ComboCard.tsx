import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { Image as ExpoImage } from "expo-image";

import Food3DIcon from "./Food3DIcon";
import { markFavoritesDirty } from "../services/favoritesStore";

const FOOD_IMAGE_BLURHASH = "L6Pj0^i_.AyE_3t7t7R**0o#DgR4";

interface RecommendedFoodCardProps {
  item: any;
  onAdd: () => void;
  onPress: () => void;
  onSkip?: () => void;
  onLove?: (item: any) => void;
}

const macro = (value: any) => `${(Number(value) || 0).toFixed(1)}g`;

const ComboCard = ({ item, onAdd, onPress, onSkip, onLove }: RecommendedFoodCardProps) => {
  const { userId } = useAuth();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!item) return null;

  // NOTE: Combo cards render up to 3 items (main/side/drink) in one tile.
  const comboItems = Array.isArray(item?.items) && item.items.length > 0 ? item.items : [item];
  const totalCalories =
    Number(item?.total_calories) ||
    comboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.calories || 0), 0);
  const totalProtein =
    Number(item?.total_protein) ||
    comboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.protein || 0), 0);
  const totalCarbs =
    Number(item?.total_carbs) ||
    comboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.carbs || 0), 0);
  const totalFats =
    Number(item?.total_fats) ||
    comboItems.reduce((sum: number, comboItem: any) => sum + Number(comboItem?.fats || 0), 0);

  const handleToggleFavorite = async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!apiURL) return;

      if (comboItems.length > 1) {
        const response = await fetch(`${apiURL}/api/favorites/save-combo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerkId: userId,
            items: comboItems,
          })
        });
        if (response.ok) {
          markFavoritesDirty(userId);
          setIsFavorite(true);
          onLove?.(item);
        }
      } else {
        const response = await fetch(`${apiURL}/api/favorites/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clerkId: userId,
            item: {
              id: item.id || item.food_id,
              externalId: item.id || item.food_id,
              title: item.title,
              image: item.image,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fats: item.fats,
              grams: item.grams,
              time: item.time,
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          markFavoritesDirty(userId);
          setIsFavorite(data.isFavorite);
          if (data.isFavorite) {
            onLove?.(item);
          }
        }
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="mb-4 bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        <View className="h-44 bg-gray-100">
          <View className="flex-row w-full h-full">
            {comboItems.slice(0, 3).map((comboItem: any, index: number) => (
              <View key={`${comboItem?.id || comboItem?.food_id}-${index}`} className="flex-1">
                {comboItem?.image ? (
                  <ExpoImage
                    source={{ uri: comboItem.image }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                    cachePolicy="disk"
                    transition={150}
                    placeholder={FOOD_IMAGE_BLURHASH}
                  />
                ) : (
                  <View className="w-full h-full items-center justify-center">
                    <Food3DIcon name={comboItem?.title || item?.title} size={42} />
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        <View className="p-4">
          <Text className="text-lg font-bold text-black mb-1" numberOfLines={2}>
            {item.title}
          </Text>

          <View className="flex-row items-center mb-2">
            <Ionicons name="flame-outline" size={15} color="#6B7280" />
            <Text className="text-gray-600 text-xs ml-1 mr-3">{Math.round(Number(totalCalories || 0))} kcal</Text>
            <Ionicons name="scale-outline" size={15} color="#6B7280" />
            <Text className="text-gray-600 text-xs ml-1">{Math.round(Number(item.grams || 100))} g</Text>
          </View>

          <View className="flex-row gap-2">
            <View className="bg-orange-50 px-2 py-1 rounded-full">
              <Text className="text-[11px] text-orange-700 font-semibold">Fat {macro(totalFats)}</Text>
            </View>
            <View className="bg-blue-50 px-2 py-1 rounded-full">
              <Text className="text-[11px] text-blue-700 font-semibold">Protein {macro(totalProtein)}</Text>
            </View>
            <View className="bg-green-50 px-2 py-1 rounded-full">
              <Text className="text-[11px] text-green-700 font-semibold">Carbs {macro(totalCarbs)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      <View className="px-4 pb-4">
        <View className="border-t border-gray-100 pt-3 flex-row justify-between items-center">
          <TouchableOpacity 
            onPress={handleToggleFavorite}
            disabled={isLoading}
            className="p-2"
          >
            <Ionicons 
              name={isFavorite ? "heart" : "heart-outline"} 
              size={24} 
              color={isFavorite ? "#EF4444" : "#A0AEC0"}
            />
          </TouchableOpacity>

          <View className="flex-row gap-2">
            {!!onSkip && (
              <TouchableOpacity onPress={onSkip} className="bg-gray-100 px-4 py-2 rounded-full border border-gray-200">
                <Text className="text-gray-700 font-bold">Skip</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onAdd} className="bg-primary px-5 py-2 rounded-full">
              <Text className="text-white font-bold">Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default ComboCard;
