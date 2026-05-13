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

    // Poultry & egg-based dishes — pair with the chicken icon since it's the closest "lean protein" silhouette.
    if (
      lowerName.includes('chicken') ||
      lowerName.includes('turkey') ||
      lowerName.includes('wings') ||
      lowerName.includes('duck') ||
      lowerName.includes('egg') ||
      lowerName.includes('omelet') ||
      lowerName.includes('frittata') ||
      lowerName.includes('quiche') ||
      lowerName.includes('poultry')
    ) return icons.chicken;

    // Red meat / pork / processed meats.
    if (
      lowerName.includes('beef') ||
      lowerName.includes('steak') ||
      lowerName.includes('burger') ||
      lowerName.includes('pork') ||
      lowerName.includes('bacon') ||
      lowerName.includes('ham') ||
      lowerName.includes('sausage') ||
      lowerName.includes('lamb') ||
      lowerName.includes('mince') ||
      lowerName.includes('meatball') ||
      lowerName.includes('hot dog') ||
      lowerName.includes('hotdog') ||
      lowerName.includes('salami') ||
      lowerName.includes('pepperoni')
    ) return icons.beef;

    // Seafood & fish.
    if (
      lowerName.includes('fish') ||
      lowerName.includes('salmon') ||
      lowerName.includes('tuna') ||
      lowerName.includes('shrimp') ||
      lowerName.includes('prawn') ||
      lowerName.includes('cod') ||
      lowerName.includes('crab') ||
      lowerName.includes('lobster') ||
      lowerName.includes('squid') ||
      lowerName.includes('octopus') ||
      lowerName.includes('mussel') ||
      lowerName.includes('oyster') ||
      lowerName.includes('seafood') ||
      lowerName.includes('sushi') ||
      lowerName.includes('sashimi')
    ) return icons.fish;

    // Carb-forward staples — grains, breads, baked carbs, breakfast cereals.
    if (
      lowerName.includes('rice') ||
      lowerName.includes('pasta') ||
      lowerName.includes('noodle') ||
      lowerName.includes('bread') ||
      lowerName.includes('toast') ||
      lowerName.includes('sandwich') ||
      lowerName.includes('wrap') ||
      lowerName.includes('roll') ||
      lowerName.includes('bun') ||
      lowerName.includes('bagel') ||
      lowerName.includes('pizza') ||
      lowerName.includes('oat') ||
      lowerName.includes('oatmeal') ||
      lowerName.includes('porridge') ||
      lowerName.includes('muesli') ||
      lowerName.includes('granola') ||
      lowerName.includes('cereal') ||
      lowerName.includes('quinoa') ||
      lowerName.includes('couscous') ||
      lowerName.includes('barley') ||
      lowerName.includes('crouton') ||
      lowerName.includes('cracker') ||
      lowerName.includes('tortilla') ||
      lowerName.includes('pretzel') ||
      lowerName.includes('biscuit') ||
      lowerName.includes('scone')
    ) return icons.rice;

    // Plant-forward — vegetables, legumes, soups, mixed salads, hummus, jackfruit.
    if (
      lowerName.includes('salad') ||
      lowerName.includes('spinach') ||
      lowerName.includes('vegetable') ||
      lowerName.includes('veggie') ||
      lowerName.includes('jackfruit') ||
      lowerName.includes('hummus') ||
      lowerName.includes('hommus') ||
      lowerName.includes('homos') ||
      lowerName.includes('soup') ||
      lowerName.includes('stew') ||
      lowerName.includes('curry') ||
      lowerName.includes('chili') ||
      lowerName.includes('chilli') ||
      lowerName.includes('lentil') ||
      lowerName.includes('bean') ||
      lowerName.includes('chickpea') ||
      lowerName.includes('tofu') ||
      lowerName.includes('tempeh') ||
      lowerName.includes('broccoli') ||
      lowerName.includes('carrot') ||
      lowerName.includes('cabbage') ||
      lowerName.includes('cauliflower') ||
      lowerName.includes('zucchini') ||
      lowerName.includes('kale') ||
      lowerName.includes('mushroom') ||
      lowerName.includes('avocado') ||
      lowerName.includes('pea') ||
      lowerName.includes('corn') ||
      lowerName.includes('potato') ||
      lowerName.includes('tomato') ||
      lowerName.includes('pickle')
    ) return icons.salad;

    // Fruits, smoothies, fruit juices, nuts (plant-based snacks).
    if (
      lowerName.includes('apple') ||
      lowerName.includes('banana') ||
      lowerName.includes('fruit') ||
      lowerName.includes('berry') ||
      lowerName.includes('berries') ||
      lowerName.includes('strawberry') ||
      lowerName.includes('blueberry') ||
      lowerName.includes('raspberry') ||
      lowerName.includes('orange') ||
      lowerName.includes('grape') ||
      lowerName.includes('mango') ||
      lowerName.includes('pineapple') ||
      lowerName.includes('peach') ||
      lowerName.includes('pear') ||
      lowerName.includes('plum') ||
      lowerName.includes('melon') ||
      lowerName.includes('watermelon') ||
      lowerName.includes('kiwi') ||
      lowerName.includes('papaya') ||
      lowerName.includes('cherry') ||
      lowerName.includes('smoothie') ||
      lowerName.includes('juice') ||
      lowerName.includes('nut') ||
      lowerName.includes('almond') ||
      lowerName.includes('walnut') ||
      lowerName.includes('peanut') ||
      lowerName.includes('cashew') ||
      lowerName.includes('seed') ||
      lowerName.includes('trail mix')
    ) return icons.fruit;

    // Hot/cold drinks not based on fruit.
    if (
      lowerName.includes('coffee') ||
      lowerName.includes('tea') ||
      lowerName.includes('latte') ||
      lowerName.includes('cappuccino') ||
      lowerName.includes('capuccino') ||
      lowerName.includes('espresso') ||
      lowerName.includes('mocha') ||
      lowerName.includes('macchiato') ||
      lowerName.includes('cold brew') ||
      lowerName.includes('water') ||
      lowerName.includes('soda') ||
      lowerName.includes('cola') ||
      lowerName.includes('lemonade') ||
      lowerName.includes('cocoa')
    ) return icons.coffee;

    // Sweets, dairy desserts, yoghurts, cheese-forward dishes.
    if (
      lowerName.includes('cake') ||
      lowerName.includes('chocolate') ||
      lowerName.includes('cookie') ||
      lowerName.includes('ice cream') ||
      lowerName.includes('icecream') ||
      lowerName.includes('gelato') ||
      lowerName.includes('sorbet') ||
      lowerName.includes('pudding') ||
      lowerName.includes('custard') ||
      lowerName.includes('dessert') ||
      lowerName.includes('brownie') ||
      lowerName.includes('donut') ||
      lowerName.includes('doughnut') ||
      lowerName.includes('muffin') ||
      lowerName.includes('pancake') ||
      lowerName.includes('waffle') ||
      lowerName.includes('croissant') ||
      lowerName.includes('pastry') ||
      lowerName.includes('pie') ||
      lowerName.includes('tart') ||
      lowerName.includes('candy') ||
      lowerName.includes('caramel') ||
      lowerName.includes('honey') ||
      lowerName.includes('yogurt') ||
      lowerName.includes('yoghurt') ||
      lowerName.includes('yogur') ||
      lowerName.includes('kohupiima') ||
      lowerName.includes('milk') ||
      lowerName.includes('cheese') ||
      lowerName.includes('butter') ||
      lowerName.includes('cream') ||
      lowerName.includes('curd')
    ) return icons.dessert;

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