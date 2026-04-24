// This component will create a format for each dish at the favorite page

import { View, Text, TouchableOpacity, Image } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import IngredientIcon from './IngredientIcon';
import Food3DIcon from './Food3DIcon';

interface FavoriteCardProps {
  item: any;
  onPress: () => void;
  onDelete: () => void;
}

const FavoriteCard = ({ item, onPress, onDelete }: FavoriteCardProps) => {
  return (
    <TouchableOpacity 
      onPress={onPress} 
      className="mb-4 bg-blue-50/50 rounded-2xl p-4 flex-row items-center border border-blue-100 shadow-sm"
    >
      {/* Image Area */}
      <View className="w-16 h-16 bg-white rounded-xl items-center justify-center mr-4 overflow-hidden border border-gray-100">
        {item.image && item.image !== "" ? (
          <Image source={{ uri: item.image }} className="w-full h-full" resizeMode="cover" />
        ) : (
          /* Use 3D Icon if no image */
          <Food3DIcon name={item.title} size={40} />
        )}
      </View>

      {/* Text Info */}
      <View className="flex-1">
        <Text className="font-bold text-base text-gray-900" numberOfLines={1}>
          {item.title}
        </Text>
        <View className="flex-row items-center mt-1">
          <Ionicons name="flame" size={14} color="orange" />
          <Text className="text-gray-500 font-bold ml-1">{Math.round(item.calories)} kcal</Text>
        </View>
      </View>

      {/* Delete Button (Stop Propagation prevents triggering the card click) */}
      <TouchableOpacity onPress={(e) => { e.stopPropagation(); onDelete(); }} className="p-3 bg-white rounded-full shadow-sm ml-2">
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

export default FavoriteCard;