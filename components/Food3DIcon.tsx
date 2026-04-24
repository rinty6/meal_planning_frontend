// This file will map the dishes which don't have image to the suitable icons

import { View, Image } from 'react-native';
import React from 'react';

const icons = {
    chicken: require('../assets/icons/raw_chicken.png'),
    beef: require('../assets/icons/steak.png'),
    fish: require('../assets/icons/fish.png'),
    rice: require('../assets/icons/rice.png'),
    salad: require('../assets/icons/salad.png'),
    fruit: require('../assets/icons/fruit.png'),
    coffee: require('../assets/icons/coffee.png'),
    dessert: require('../assets/icons/desert.png'),
    default: require('../assets/images/food_image.jpg'),
};

interface Food3DIconProps {
  name: string;
  size?: number;
}

const Food3DIcon = ({ name, size = 60 }: Food3DIconProps) => {
  // 2. THE LOGIC (Keyword Matching)
  const getIconSource = (foodName: string) => {
    const lowerName = foodName.toLowerCase();

    if (lowerName.includes('chicken') || lowerName.includes('turkey') || lowerName.includes('wings')) return icons.chicken;
    if (lowerName.includes('beef') || lowerName.includes('steak') || lowerName.includes('burger') || lowerName.includes('pork')) return icons.beef;
    if (lowerName.includes('fish') || lowerName.includes('salmon') || lowerName.includes('tuna') || lowerName.includes('shrimp')) return icons.fish;
    if (lowerName.includes('rice') || lowerName.includes('pasta') || lowerName.includes('noodle') || lowerName.includes('bread')) return icons.rice;
    if (lowerName.includes('salad') || lowerName.includes('spinach') || lowerName.includes('vegetable')) return icons.salad;
    if (lowerName.includes('apple') || lowerName.includes('banana') || lowerName.includes('fruit') || lowerName.includes('berry')) return icons.fruit;
    if (lowerName.includes('coffee') || lowerName.includes('tea') || lowerName.includes('latte') || lowerName.includes('water')) return icons.coffee;
    if (lowerName.includes('cake') || lowerName.includes('chocolate') || lowerName.includes('cookie') || lowerName.includes('ice cream')) return icons.dessert;

    return icons.default; // Fallback
  };

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Image 
        source={getIconSource(name)} 
        style={{ width: '100%', height: '100%' }} 
        resizeMode="contain" 
      />
    </View>
  );
};

export default Food3DIcon;