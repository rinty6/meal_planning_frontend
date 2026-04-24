// This file display the meal at the planning page
// It includes a title, a protein, a cooking time, an add function and a heart icon

import { View, Text, Image, TouchableOpacity } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface RecipeCardProps {
  title: string;
  calories: number;
  time: string;
  image: any;
  onAdd: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

const RecipeCard = ({ title, calories, time, image, onAdd, onToggleFavorite, isFavorite = false }: RecipeCardProps) => {
  
  return (
    <View className="mb-6 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      
      {/* Image */}
      <Image 
        source={typeof image === 'string' && image ? { uri: image } : require('../assets/images/food_image.jpg')} 
        className="w-full h-40" 
        resizeMode="cover" 
      />

      <View className="p-4">
        {/* Title & Add Button */}
        <View className="flex-row justify-between items-start mb-2">
          <Text className="text-lg font-semibold text-black flex-1 mr-2" numberOfLines={2}>
            {title}
          </Text>
          <TouchableOpacity onPress={onAdd} className="bg-primary px-5 py-2 rounded-full">
            <Text className="text-white font-bold text-sm">Add</Text>
          </TouchableOpacity>
        </View>

        {/* Macros & Heart */}
        <View className="flex-row items-center space-x-4 mt-1">
          <View className="flex-row items-center">
            <Ionicons name="flame" size={18} color="orange" />
            <Text className="text-gray-500 text-sm ml-1 font-medium">{calories} kcal</Text>
          </View>

          <Text className="text-gray-300 mx-1">|</Text>

          <View className="flex-row items-center">
             {/* If generic food, time might be N/A, we can hide or show generic icon */}
             <Ionicons name="time-outline" size={18} color="black" />
             <Text className="text-gray-500 text-sm ml-1 font-medium">{time}</Text>
          </View>

          {/* ACTIVE HEART BUTTON */}
          <TouchableOpacity onPress={onToggleFavorite} className="flex-1 items-end pr-2">
            <Ionicons 
                name={isFavorite ? "heart" : "heart-outline"} 
                size={24} 
                color={isFavorite ? "red" : "gray"} 
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default RecipeCard;