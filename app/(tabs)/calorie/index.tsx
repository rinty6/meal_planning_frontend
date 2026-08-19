// This file will create the calorie menu page

import { View, Text, ScrollView } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import MenuOptions from '../../../components/menuoptions'; 
import PipMenuScene from '../../../components/pip/pip-menu-scene';

const CalorieMenuScreen = () => {
  const router = useRouter();
  const isFocused = useIsFocused();

  return (
    <SafeAreaView className='flex-1 bg-white px-5' edges={['top', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* 1. Header Title */}
        <Text className="text-center text-2xl font-bold my-4">Calorie</Text>

        {/* Audit: Workout replaces the remote gym photo and only animates while the Calorie menu is focused. */}
        <View className="items-center mb-10 rounded-2xl overflow-hidden shadow-sm">
            <PipMenuScene
                accessibilityLabel="Pip performing a barbell back squat"
                animated={isFocused}
                scene="workout"
            />
        </View>

        {/* 3. Menu Options */}
        <View className="gap-2">
            <MenuOptions 
                title="Calorie Summary" 
                onPress={() => router.push('/(tabs)/calorie/summary')} 
            />

            <MenuOptions 
                title="Goal setting" 
                onPress={() => router.push('/(tabs)/calorie/goalSetting')} 
            />

            <MenuOptions 
                title="Saved goal" 
                onPress={() => router.push('/(tabs)/calorie/savedGoal')} 
            />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

export default CalorieMenuScreen;
