import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import CircularProgress from '../../components/CircularProgress';
import ComboCard from '../../components/ComboCard';
import { searchFoodItemsWithNutrition } from '../../services/mealAPI';
import {
    getCachedHomeSnapshot,
    setCachedHomeDashboard,
    setCachedHomeFoodItems,
    shouldRefreshHomeDashboard,
    shouldRefreshHomeFoodItems,
} from '../../services/homeStore';

type MacroSet = {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
};

const DEFAULT_CALORIE_TARGET = 2000;
const HOME_DASHBOARD_REFRESH_TTL_MS = 15 * 1000;
const HOME_FOOD_ITEMS_REFRESH_TTL_MS = 30 * 60 * 1000;

const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const firstNumber = (...values: unknown[]) => {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
};

const hasMacros = (macroData: MacroSet) =>
    macroData.calories > 0 || macroData.protein > 0 || macroData.carbs > 0 || macroData.fats > 0;

const extractConsumedMacros = (summaryData: any): MacroSet => {
    const consumed = summaryData?.consumed ?? summaryData?.summary ?? summaryData?.totals ?? {};
    return {
        calories: firstNumber(consumed.calories, consumed.kcal, consumed.totalCalories, summaryData?.calories, summaryData?.totalCalories),
        protein: firstNumber(consumed.protein, consumed.proteins, consumed.totalProtein, summaryData?.protein, summaryData?.totalProtein),
        carbs: firstNumber(consumed.carbs, consumed.carbohydrates, consumed.totalCarbs, summaryData?.carbs, summaryData?.totalCarbs),
        fats: firstNumber(consumed.fats, consumed.fat, consumed.totalFat, summaryData?.fats, summaryData?.fat, summaryData?.totalFats),
    };
};

const aggregateMeals = (meals: any[]): MacroSet =>
    meals.reduce(
        (totals: MacroSet, meal: any) => ({
            calories: totals.calories + toNumber(meal?.calories),
            protein: totals.protein + toNumber(meal?.protein),
            carbs: totals.carbs + toNumber(meal?.carbs),
            fats: totals.fats + firstNumber(meal?.fats, meal?.fat),
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

const buildTargetMacros = (dailyCalories: number): MacroSet => ({
    calories: dailyCalories,
    carbs: (dailyCalories * 0.5) / 4,
    protein: (dailyCalories * 0.3) / 4,
    fats: (dailyCalories * 0.2) / 9,
});

// Helper to format date strictly as YYYY-MM-DD for local time
const getTodayFormatted = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper to get friendly date display matching UI (e.g., "February 2026 Tue")
const getFriendlyDate = () => {
    const now = new Date();
    const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
    return `${monthYear} ${weekday}`;
};

// Helper for time-based greeting
const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
};

const HomeScreen = () => {
    const router = useRouter();
    const { userId } = useAuth(); // Clerk ID
    const { user: clerkUser } = useUser();
    
    const [loading, setLoading] = useState(true);
    const [dbUserName, setDbUserName] = useState('');
    
    // Macro State
    const [macros, setMacros] = useState({
        consumed: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        target: buildTargetMacros(DEFAULT_CALORIE_TARGET)
    });

    // Food Items State
    const [foodItems, setFoodItems] = useState<any[]>([]);
    const [loadingFoodItems, setLoadingFoodItems] = useState(false);

    const hydrateFromCache = useCallback(() => {
        if (!userId) return;
        const cached = getCachedHomeSnapshot(userId);
        if (!cached) return;

        if (cached.dbUserName) {
            setDbUserName(cached.dbUserName);
        }
        if (cached.macros) {
            setMacros(cached.macros);
            setLoading(false);
        }
        if (cached.foodItems.length > 0) {
            setFoodItems(cached.foodItems);
            setLoadingFoodItems(false);
        }
    }, [userId]);

    const loadDashboardData = useCallback(async ({ showSpinner = true } = {}) => {
        if (!userId) {
            setLoading(false);
            return;
        }

        if (showSpinner) setLoading(true);
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            if (!apiURL) {
                setLoading(false);
                return;
            }

            const today = getTodayFormatted();

            const [profileResult, summaryResult] = await Promise.allSettled([
                fetch(`${apiURL}/api/profile/${userId}`),
                fetch(`${apiURL}/api/calorie/summary/${userId}/${today}`)
            ]);

            let resolvedUserName = clerkUser?.firstName || 'User';
            // Set User Name
            if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
                const profileData = await profileResult.value.json();
                resolvedUserName = profileData.user?.username || clerkUser?.firstName || 'User';
            }
            setDbUserName(resolvedUserName);

            let summaryPayload: any = null;
            if (summaryResult.status === 'fulfilled' && summaryResult.value.ok) {
                summaryPayload = await summaryResult.value.json();
            }

            let consumedMacros = extractConsumedMacros(summaryPayload);
            const dailyCalorieTarget =
                firstNumber(
                    summaryPayload?.goal?.dailyCalories,
                    summaryPayload?.target?.dailyCalories,
                    summaryPayload?.dailyCalories,
                    summaryPayload?.targetCalories
                ) || DEFAULT_CALORIE_TARGET;

            // Fallback: if summary payload is empty/zero, compute from today's meal logs directly.
            if (!hasMacros(consumedMacros)) {
                const mealsRes = await fetch(`${apiURL}/api/meals/summary/${userId}/${today}`);
                if (mealsRes.ok) {
                    const meals = await mealsRes.json();
                    consumedMacros = aggregateMeals(Array.isArray(meals) ? meals : []);
                }
            }

            setMacros({
                consumed: consumedMacros,
                target: buildTargetMacros(dailyCalorieTarget),
            });
            setCachedHomeDashboard(userId, {
                dbUserName: resolvedUserName,
                macros: {
                    consumed: consumedMacros,
                    target: buildTargetMacros(dailyCalorieTarget),
                },
            });
        } catch (error) {
            console.error("Dashboard Load Error:", error);
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, [userId, clerkUser?.firstName]);

    const loadFoodItems = useCallback(async ({ showSpinner = true } = {}) => {
        if (showSpinner) setLoadingFoodItems(true);
        try {
            // Fetch popular food items with nutritional data
            const items = await searchFoodItemsWithNutrition('chicken', 5);
            setFoodItems(items);
            if (userId) {
                setCachedHomeFoodItems(userId, items);
            }
        } catch (error) {
            console.error("Error loading food items:", error);
        } finally {
            if (showSpinner) setLoadingFoodItems(false);
        }
    }, [userId]);

    useFocusEffect(useCallback(() => {
        const cached = getCachedHomeSnapshot(userId);
        hydrateFromCache();

        const shouldRefreshDashboard = shouldRefreshHomeDashboard(userId, HOME_DASHBOARD_REFRESH_TTL_MS) || !cached?.macros;
        const shouldRefreshFoods = shouldRefreshHomeFoodItems(userId, HOME_FOOD_ITEMS_REFRESH_TTL_MS) || !cached?.foodItems?.length;

        if (shouldRefreshDashboard) {
            void loadDashboardData({ showSpinner: !cached?.macros });
        }
        if (shouldRefreshFoods) {
            void loadFoodItems({ showSpinner: !cached?.foodItems?.length });
        }
    }, [hydrateFromCache, loadDashboardData, loadFoodItems, userId]));

    const categories = [
        { name: 'Meal', icon: 'restaurant-outline', route: '/(tabs)/meal/planning' },
        { name: 'Calorie', icon: 'flame-outline', route: '/(tabs)/calorie/summary' },
        { name: 'Profile', icon: 'person-outline', route: '/(tabs)/profile' },
        { name: 'Shopping', icon: 'basket-outline', route: '/(tabs)/meal/shopping' },
        { name: 'Recipe', icon: 'book-outline', route: '/(tabs)/meal/recipe' },
        { name: 'Feedback', icon: 'chatbubble-outline', route: '/(tabs)/profile/feedback' },
    ];

    if (loading) {
        return (
            <SafeAreaView className="flex-1 justify-center items-center" style={{ backgroundColor: '#EFF3F7' }}>
                <ActivityIndicator size="large" color="#3B82F6" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1" style={{ backgroundColor: '#EFF3F7' }}>
            <ScrollView className="px-4 pt-4" showsVerticalScrollIndicator={false}>
                
                {/* 1. Hero Image Section */}
                <View className="mb-6 rounded-2xl overflow-hidden h-48 items-center justify-center flex-row"
                    style={{
                        backgroundColor: '#3B82F6',
                        shadowColor: '#0F172A',
                        shadowOpacity: 0.1,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 3,
                    }}>
                    <View className="absolute inset-0 items-center justify-center">
                        <Ionicons name="nutrition" size={80} color="#FFFFFF" style={{ opacity: 0.3 }} />
                    </View>
                    <View className="items-center z-10">
                        <Text className="text-white text-2xl font-bold mb-2">Eat Healthy Today</Text>
                        <Text className="text-white text-sm px-4 text-center">Track your nutrition and reach your fitness goals</Text>
                    </View>
                </View>

                {/* 2. Header Section */}
                <View className="flex-row justify-between items-center mb-6">
                    <View className="flex-row items-center flex-1 pr-3">
                        {clerkUser?.imageUrl ? (
                            <Image
                                source={{ uri: clerkUser.imageUrl }}
                                className="w-12 h-12 rounded-full mr-3"
                            />
                        ) : (
                            <View
                                className="w-12 h-12 rounded-full mr-3 items-center justify-center"
                                style={{ backgroundColor: '#3B82F6' }}
                            >
                                <Text className="text-white text-xl font-semibold">
                                    {(dbUserName || clerkUser?.firstName || 'U').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        <View className="flex-1">
                            <Text
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                className="text-xl font-bold"
                                style={{ color: '#0B2149' }}
                            >
                                {getGreeting()}, {dbUserName}
                            </Text>
                            <Text className="text-sm" style={{ color: '#70819A' }}>
                                {getFriendlyDate()}
                            </Text>
                        </View>
                    </View>
                    
                    {/* Notification Bell */}
                    <TouchableOpacity onPress={() => router.push('/(tabs)/profile/notifications')} className="relative p-2">
                        <Ionicons name="notifications-outline" size={24} color="#64748B" />
                        <View className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: '#EF4444' }} />
                    </TouchableOpacity>
                </View>

                {/* 3. Calorie Summary Section */}
                <Text className="text-3xl font-bold mb-3" style={{ color: '#0B2149' }}>Calorie Summary</Text>
                <View
                    className="rounded-2xl p-4 mb-8"
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#DAE2EC',
                        borderWidth: 1,
                        shadowColor: '#0F172A',
                        shadowOpacity: 0.08,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                    }}
                >
                    <View className="flex-row justify-between items-center mb-4">
                        <View className="flex-1">
                            <Text className="text-xl font-semibold" style={{ color: '#0F172A' }}>
                                Calorie Target: {Math.round(macros.target.calories)}
                            </Text>
                            {macros.consumed.calories > macros.target.calories && (
                                <Text className="text-sm font-semibold mt-1" style={{ color: '#EF4444' }}>
                                    You cross your daily calorie target
                                </Text>
                            )}
                        </View>
                        <Ionicons name="ellipsis-horizontal" size={20} color="#A0AEC0" />
                    </View>
                    
                    {/* Centered layout for the 4 key macros */}
                    <View className="flex-row justify-between items-end px-2 pb-1">
                        <CircularProgress 
                            value={macros.consumed.carbs} 
                            maxValue={macros.target.carbs} 
                            radius={26}
                            strokeWidth={5}
                            color="#7A879A"
                            trackColor="#E5EBF2"
                            valueColor="#1E293B"
                            labelColor="#334155"
                            label="Carbs"
                            unit="g"
                            showConsumed={true}
                        />
                        <CircularProgress 
                            value={macros.consumed.fats} 
                            maxValue={macros.target.fats} 
                            radius={26}
                            strokeWidth={5}
                            color="#D2DAE5"
                            trackColor="#E5EBF2"
                            valueColor="#1E293B"
                            labelColor="#334155"
                            label="Fat"
                            unit="g"
                            showConsumed={true}
                        />
                        <CircularProgress 
                            value={macros.consumed.protein} 
                            maxValue={macros.target.protein} 
                            radius={26}
                            strokeWidth={5}
                            color="#63748C"
                            trackColor="#E5EBF2"
                            valueColor="#1E293B"
                            labelColor="#334155"
                            label="Protein"
                            unit="g"
                            showConsumed={true}
                        />
                        <CircularProgress 
                            value={macros.consumed.calories} 
                            maxValue={macros.target.calories} 
                            radius={32}
                            strokeWidth={6}
                            color="#7ABC28"
                            trackColor="#E5EBF2"
                            valueColor="#1E293B"
                            labelColor="#334155"
                            label="Calories"
                            unit="cal"
                            showConsumed={true}
                        />
                    </View>
                </View>

                {/* 4. Category Grid Section */}
                <Text className="text-3xl font-bold mb-3" style={{ color: '#0B2149' }}>Category</Text>
                <View className="flex-row flex-wrap justify-between pb-10">
                    {categories.map((cat, index) => (
                        <TouchableOpacity 
                            key={index}
                            onPress={() => router.push(cat.route as any)}
                            className="w-[31%] rounded-2xl p-4 items-center mb-4"
                            style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DAE2EC' }}
                        >
                            <View className="w-12 h-12 rounded-full items-center justify-center mb-2" style={{ backgroundColor: '#F1F5F9' }}>
                                <Ionicons name={cat.icon as any} size={24} color="#475569" />
                            </View>
                            <Text style={{ color: '#0F172A', fontSize: 15, fontWeight: '500' }}>{cat.name}</Text>
                        </TouchableOpacity>
                    ))}
                    <View className="w-[31%]" />
                    <View className="w-[31%]" />
                </View>

                {/* 5. Food Items Section */}
                <Text className="text-3xl font-bold mb-3" style={{ color: '#0B2149' }}>Recommended Foods</Text>
                {loadingFoodItems ? (
                    <View className="items-center py-8">
                        <ActivityIndicator size="large" color="#3B82F6" />
                    </View>
                ) : foodItems.length > 0 ? (
                    <View className="pb-10">
                        {foodItems.map((item, index) => (
                            <ComboCard
                                key={index}
                                item={item}
                                onPress={() => {
                                    router.push({
                                        pathname: '/(tabs)/meal/comboDetail',
                                        params: { itemData: JSON.stringify(item) }
                                    });
                                }}
                                onAdd={() => {
                                    router.push({
                                        pathname: '/(tabs)/meal/comboDetail',
                                        params: { itemData: JSON.stringify(item) }
                                    });
                                }}
                            />
                        ))}
                    </View>
                ) : (
                    <View className="items-center py-8">
                        <Text style={{ color: '#70819A', fontSize: 14 }}>No food items available</Text>
                    </View>
                )}

            </ScrollView>
        </SafeAreaView>
    );
};

export default HomeScreen;
