import { View, Text, ScrollView } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import MenuOptions from '../../../components/menuoptions';
import PipMenuScene from '../../../components/pip/pip-menu-scene';

const MealScreen = () => {
    const router = useRouter();
    const isFocused = useIsFocused();

    return (
        <SafeAreaView className='flex-1 bg-white px-5' edges={['top', 'left', 'right']}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* 1. Header Title */}
                <Text className="text-center text-2xl font-bold my-4">Meal</Text>

                {/* Audit: Cooking replaces the former food photo and only animates while the Meal menu is focused. */}
                <View className="items-center mb-8 rounded-2xl overflow-hidden">
                    <PipMenuScene
                        accessibilityLabel="Pip cooking a healthy meal at a kitchen bench"
                        animated={isFocused}
                        scene="cooking"
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

                {/* Dev-only preview of the meal-log status card. Checklist p9-2:
                    remove this row (and app/dev-pip-status.tsx) before release.
                    The cast is because expo-router's generated route types only
                    learn about a new file once the dev server has run. */}
                {__DEV__ && (
                    <MenuOptions
                        title="Pip status harness (dev)"
                        onPress={() => router.push('/dev-pip-status' as unknown as Href)}
                    />
                )}


            </ScrollView>

        </SafeAreaView>
    )
}

export default MealScreen;
