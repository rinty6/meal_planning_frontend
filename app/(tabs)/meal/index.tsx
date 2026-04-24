import { View, Text, Image, ScrollView } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MenuOptions from '../../../components/menuoptions';

const MealScreen = () => {
    const router = useRouter();

    return (
        <SafeAreaView className='flex-1 bg-white px-5'>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* 1. Header Title */}
                <Text className="text-center text-2xl font-bold my-4">Meal</Text>

                {/* 2. The Hero Image */}
                <View className="items-center mb-8 rounded-2xl overflow-hidden">
                    <Image 
                        source={require('../../../assets/images/food_image.jpg')}
                        style={{width:'100%', height: 200}}
                        resizeMode='cover'
                    />
                </View>
                {/* 3. The Menu Options */}
                <MenuOptions 
                    title="Meal Planning"
                    onPress={() => router.push('/(tabs)/meal/planning')}
                />

                <MenuOptions 
                    title="Recipe"
                    onPress={() => router.push('/(tabs)/meal/recipe')}
                />

                <MenuOptions 
                    title="Meal summary" 
                    onPress={() => router.push('/(tabs)/meal/summary')} 
                />

                <MenuOptions 
                    title="My Favorites" 
                    onPress={() => router.push('/(tabs)/meal/favorites')} 
                />
                
                <MenuOptions 
                    title="My Shopping list" 
                    onPress={() => router.push('/(tabs)/meal/shopping')} 
                />


            </ScrollView>

        </SafeAreaView>
    )
}

export default MealScreen;