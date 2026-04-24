// This file will create the calorie menu page

import { View, Text, Image, ScrollView } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MenuOptions from '../../../components/menuoptions'; 

const CalorieMenuScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView className='flex-1 bg-white px-5'>
      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* 1. Header Title */}
        <Text className="text-center text-2xl font-bold my-4">Calorie</Text>

        {/* 2. Hero Image */}
        {/* Replace the source with your specific gym/fitness image */}
        <View className="items-center mb-10 rounded-2xl overflow-hidden shadow-sm">
            <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1000&auto=format&fit=crop' }} 
                // Or use local: source={require('../../../assets/images/gym_hero.jpg')}
                style={{ width: '100%', height: 220 }}
                resizeMode="cover"
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