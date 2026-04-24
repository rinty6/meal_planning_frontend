// This component shows the ingredients' icons in case we don't have their images


import React from 'react';
import { Ionicons } from '@expo/vector-icons';

// 1. The Logic Helper 
// (Determines which icon name to use based on text)
export const getIconName = (ingredientName: string): keyof typeof Ionicons.glyphMap => {
  const lowerName = ingredientName.toLowerCase();
  
  // Proteins
  if (lowerName.match(/chicken|beef|pork|meat|fish|tuna|salmon|steak|shrimp/)) return "restaurant";
  
  // Veggies & Greens
  if (lowerName.match(/lettuce|onion|spinach|vegetable|carrot|broccoli|tomato|leaf|garlic/)) return "leaf";
  
  // Liquids
  if (lowerName.match(/water|oil|sauce|milk|juice|vinegar|soup/)) return "water";
  
  // Carbs / Grains
  if (lowerName.match(/rice|bread|pasta|flour|oat|cereal|dough/)) return "ellipse"; // "ellipse" looks a bit like a grain/bun
  
  // Fruits
  if (lowerName.match(/apple|banana|orange|berry|fruit|lemon/)) return "nutrition"; 
  
  // Dairy / Eggs
  if (lowerName.match(/egg|cheese|butter|yogurt/)) return "egg"; // Note: Check if your icon set has 'egg', otherwise use 'nutrition'
  
  // Sweets
  if (lowerName.match(/sugar|honey|chocolate|cookie|cake/)) return "heart";

  // Default
  return "fast-food"; 
};

// 2. The Component
interface IngredientIconProps {
  ingredientName: string;
  size?: number;
  color?: string;
  style?: any;
}

const IngredientIcon = ({ ingredientName, size = 28, color = "#9CA3AF", style }: IngredientIconProps) => {
  const iconName = getIconName(ingredientName);
  
  return <Ionicons name={iconName} size={size} color={color} style={style} />;
};

export default IngredientIcon;