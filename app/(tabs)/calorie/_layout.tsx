// This file sets the layout of the calorie folders
// Including menu page, summary, goal setting and saved goal

import { Stack } from 'expo-router';

export default function CalorieLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* The Menu Page (index.tsx) */}
      <Stack.Screen name="index" />
      
      {/* Sub-pages with Back Buttons */}
      <Stack.Screen 
        name="summary" 
        options={{ 
            headerShown: false, 
            title: 'Calorie Summary',
            headerBackTitle: 'Back' 
        }} 
      />
      <Stack.Screen 
        name="goalSetting" 
        options={{ 
            headerShown: false, 
            title: 'Goal Setting',
            headerBackTitle: 'Back' 
        }} 
      />
      <Stack.Screen 
        name="savedGoal" 
        options={{ 
            headerShown: false, 
            title: 'Saved Goals',
            headerBackTitle: 'Back' 
        }} 
      />
    </Stack>
  );
}