import { Stack } from 'expo-router';

export default function MealLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* This "index" refers to app/(tabs)/meal/index.tsx 
        It tells the app: "When the user clicks the Meal Tab, show the index page first."
      */}
      <Stack.Screen name="index" /> 
      
      <Stack.Screen 
        name="planning" 
        options={{ 
          headerShown: false, 
        }} 
      />

      <Stack.Screen 
        name="comboDetail" 
        options={{ 
          headerShown: false, 
        }} 
      />
      
      <Stack.Screen 
        name="recipe/index" 
        options={{ 
          headerShown: false, 
          title: 'Recipes',
          headerBackTitle: 'Menu'
        }} 
      />

      <Stack.Screen 
        name="recipedetail" 
        options={{ 
          headerShown: false, 
          title: 'Recipe Detail',
          headerBackTitle: 'Back' 
        }} 
      />

      <Stack.Screen 
        name="summary" 
        options={{ 
          headerShown: false, 
        }} 
      />
      
      <Stack.Screen 
        name="favorites" 
        options={{ 
          headerShown: false, 
          title: 'My Favorites',
          headerBackTitle: 'Menu'
        }} 
      />

      <Stack.Screen 
        name="shopping" 
        options={{ 
          headerShown: false, 
          title: 'My Shopping List',
          headerBackTitle: 'Menu'
        }} 
      />
      <Stack.Screen 
        name="shoppingListDetail" 
        options={{ 
          headerShown: false, 
          title: 'My Shopping List',
          headerBackTitle: 'Menu'
        }} 
      />
       
    </Stack>
  );
}