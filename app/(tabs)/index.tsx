import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Modal, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import CircularProgress from '../../components/CircularProgress';
import ComboCard from '../../components/ComboCard';
import AddFoodModal from '../../components/addfoodmodal';
import SuccessModal from '../../components/sucessmodal';
import CustomAlert from '../../components/customAlert';
import GuidanceContent from '../../components/GuidanceContent';
import SafeFullScreenModal from '../../components/SafeFullScreenModal';
import { getCurrentFoodSuggestionMealPeriod, searchFoodItemsWithNutrition } from '../../services/mealAPI';
import {
    getCachedHomeSnapshot,
    hydrateHomeFoodItemsFromStorage,
    setCachedHomeDashboard,
    setCachedHomeFoodItems,
    shouldRefreshHomeDashboard,
    shouldRefreshHomeFoodItems,
} from '../../services/homeStore';
import {
    fetchMealsSummaryWithCache,
    markMealsSummaryDirty,
} from '../../services/mealsSummaryStore';
import { markFavoritesDirty } from '../../services/favoritesStore';

type MacroSet = {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
};

type MealLogType = 'breakfast' | 'lunch' | 'dinner';

const DEFAULT_CALORIE_TARGET = 2000;
const HOME_DASHBOARD_REFRESH_TTL_MS = 15 * 1000;
const HOME_FOOD_ITEMS_REFRESH_TTL_MS = 30 * 60 * 1000;
const THEME_COLORS = {
    primary: '#007BFF',
    secondary: '#FF9500',
    success: '#10B981',
    error: '#EF4444',
    textDeep: '#0B2149',
    textPrimary: '#000000',
    textSecondary: '#6B7280',
    borderSoft: '#DAE2EC',
    macroTrack: '#D1D5DB',
};

const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatWholeNumber = (value: number) =>
    Math.round(value).toLocaleString('en-US');

const safeTarget = (value: number) => Math.max(1, toNumber(value));

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

const getDefaultMealLogType = (): MealLogType => {
    const currentPeriod = getCurrentFoodSuggestionMealPeriod();
    if (currentPeriod === 'breakfast' || currentPeriod === 'lunch' || currentPeriod === 'dinner') {
        return currentPeriod;
    }

    const hour = new Date().getHours();
    if (hour < 5) return 'breakfast';
    if (hour < 17) return 'lunch';
    return 'dinner';
};

const getFavoriteExternalId = (item: any) =>
    String(item?.fatsecret_food_id || item?.food_id || item?.externalId || item?.external_id || item?.id || '').trim();

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
    const [isAddFoodModalVisible, setIsAddFoodModalVisible] = useState(false);
    const [activeMealType, setActiveMealType] = useState<MealLogType>('breakfast');
    const [showSuccess, setShowSuccess] = useState(false);
    const [showMealSelector, setShowMealSelector] = useState(false);
    const [isGuidanceVisible, setIsGuidanceVisible] = useState(false);
    const [selectedRecommendedFood, setSelectedRecommendedFood] = useState<any | null>(null);
    const [favoriteItemKeys, setFavoriteItemKeys] = useState<Record<string, boolean>>({});
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        title: '',
        message: '',
        confirmText: 'OK',
        variant: 'default' as 'default' | 'success',
    });

    const showCustomAlert = useCallback((
        title: string,
        message: string,
        options: { confirmText?: string; variant?: 'default' | 'success' } = {}
    ) => {
        setAlertConfig({
            title,
            message,
            confirmText: options.confirmText || 'OK',
            variant: options.variant || 'default',
        });
        setAlertVisible(true);
    }, []);

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
                const meals = await fetchMealsSummaryWithCache({
                    apiURL,
                    userId,
                    date: today,
                });
                if (meals) {
                    consumedMacros = aggregateMeals(meals);
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
            // Empty query lets mealAPI choose breakfast/lunch/dinner/snack suggestions by current time.
            const items = await searchFoodItemsWithNutrition('', 5, {
                hydrateDetails: false,
                hydrateImages: false,
            });
            setFoodItems(items);
            if (userId) {
                setCachedHomeFoodItems(
                    userId,
                    items,
                    items[0]?.recommendationMealPeriod || getCurrentFoodSuggestionMealPeriod()
                );
            }
        } catch (error) {
            console.error("Error loading food items:", error);
        } finally {
            if (showSpinner) setLoadingFoodItems(false);
        }
    }, [userId]);

    const loadFavoriteItemKeys = useCallback(async () => {
        if (!userId) return;
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            if (!apiURL) return;
            const response = await fetch(`${apiURL}/api/favorites/list/${encodeURIComponent(userId)}`, {
                cache: 'no-store',
            });
            if (!response.ok) return;
            const data = await response.json();
            const next: Record<string, boolean> = {};
            const favorites = Array.isArray(data?.favoriteFoods) ? data.favoriteFoods : [];
            favorites.forEach((favorite: any) => {
                const externalId = String(favorite?.externalId || favorite?.external_id || '').trim();
                if (externalId) next[externalId] = true;
            });
            setFavoriteItemKeys(next);
        } catch (error) {
            console.error('Home favorite status load error:', error);
        }
    }, [userId]);

    useFocusEffect(useCallback(() => {
        let isActive = true;

        const initializeHomeScreen = async () => {
            let cached = getCachedHomeSnapshot(userId);
            hydrateFromCache();

            if (!cached?.foodItems?.length) {
                const persisted = await hydrateHomeFoodItemsFromStorage(userId);
                if (!isActive) return;
                if (persisted?.foodItems?.length) {
                    cached = persisted;
                    setFoodItems(persisted.foodItems);
                    setLoadingFoodItems(false);
                }
            }

            const shouldRefreshDashboard = shouldRefreshHomeDashboard(userId, HOME_DASHBOARD_REFRESH_TTL_MS) || !cached?.macros;
            const shouldRefreshFoods =
                shouldRefreshHomeFoodItems(userId, HOME_FOOD_ITEMS_REFRESH_TTL_MS, getCurrentFoodSuggestionMealPeriod()) ||
                !cached?.foodItems?.length;

            if (shouldRefreshDashboard) {
                void loadDashboardData({ showSpinner: !cached?.macros });
            }
            if (shouldRefreshFoods) {
                void loadFoodItems({ showSpinner: !cached?.foodItems?.length });
            }
            void loadFavoriteItemKeys();
        };

        void initializeHomeScreen();

        return () => {
            isActive = false;
        };
    }, [hydrateFromCache, loadDashboardData, loadFavoriteItemKeys, loadFoodItems, userId]));

    const handleOpenHomeAddFood = () => {
        setActiveMealType(getDefaultMealLogType());
        setIsAddFoodModalVisible(true);
    };

    const handleAddHomeFood = async (foodItem: any, mealTypeOverride?: MealLogType) => {
        if (!userId) {
            showCustomAlert('Error', 'You must be logged in to save meals.');
            return;
        }

        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            if (!apiURL) throw new Error('Missing backend URL');
            const mealType = mealTypeOverride || activeMealType;

            const response = await fetch(`${apiURL}/api/meals/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clerkId: userId,
                    date: getTodayFormatted(),
                    mealType,
                    foodName: foodItem.title || foodItem.food_name || 'Unknown Item',
                    calories: toNumber(foodItem.calories),
                    protein: toNumber(foodItem.protein),
                    carbs: toNumber(foodItem.carbs),
                    fats: firstNumber(foodItem.fats, foodItem.fat),
                    image: foodItem.image || '',
                }),
            });

            if (!response.ok) throw new Error('Could not save food');

            markMealsSummaryDirty(userId, getTodayFormatted());
            setIsAddFoodModalVisible(false);
            setShowSuccess(true);
            void loadDashboardData({ showSpinner: false });
        } catch (error) {
            console.error('Home add food error:', error);
            showCustomAlert('Error', 'Failed to add food item.');
        }
    };

    const openRecommendedMealSelector = (item: any) => {
        setSelectedRecommendedFood(item);
        setShowMealSelector(true);
    };

    const handleSelectRecommendedMeal = (mealType: MealLogType) => {
        const item = selectedRecommendedFood;
        setShowMealSelector(false);
        setSelectedRecommendedFood(null);
        if (item) {
            void handleAddHomeFood(item, mealType);
        }
    };

    const handleFavoriteChange = (item: any, isFavorite: boolean) => {
        const externalId = getFavoriteExternalId(item);
        if (externalId) {
            setFavoriteItemKeys((current) => ({
                ...current,
                [externalId]: isFavorite,
            }));
        }
        markFavoritesDirty(userId);

        if (isFavorite) {
            showCustomAlert('Success!', 'Dish saved to your favorite foods.', {
                confirmText: 'Confirm',
                variant: 'success',
            });
        } else {
            showCustomAlert('Favorites', 'Dish removed from your favorite foods.');
        }
    };

    const categories = [
        { name: 'Guide', icon: 'help-circle-outline', onPress: () => setIsGuidanceVisible(true), iconColor: THEME_COLORS.primary, iconBgClass: 'bg-primarySoft' },
        { name: 'Add Food', icon: 'add-circle-outline', onPress: handleOpenHomeAddFood, iconColor: THEME_COLORS.secondary, iconBgClass: 'bg-secondarySoft' },
        { name: 'Meal', icon: 'restaurant-outline', route: '/(tabs)/meal/planning', iconColor: THEME_COLORS.primary, iconBgClass: 'bg-primarySoft' },
        { name: 'Calorie', icon: 'flame-outline', route: '/(tabs)/calorie/summary', iconColor: THEME_COLORS.secondary, iconBgClass: 'bg-secondarySoft' },
        { name: 'Profile', icon: 'person-outline', route: '/(tabs)/profile', iconColor: THEME_COLORS.primary, iconBgClass: 'bg-primarySoft' },
        { name: 'Shopping', icon: 'basket-outline', route: '/(tabs)/meal/shopping', iconColor: THEME_COLORS.success, iconBgClass: 'bg-successSoft' },
        { name: 'Recipe', icon: 'book-outline', route: '/(tabs)/meal/recipe', iconColor: THEME_COLORS.secondary, iconBgClass: 'bg-secondarySoft' },
        { name: 'Feedback', icon: 'chatbubble-outline', route: '/(tabs)/profile/feedback', iconColor: THEME_COLORS.textSecondary, iconBgClass: 'bg-neutralSoft' },
    ];

    const consumedCalories = Math.max(0, toNumber(macros.consumed.calories));
    const calorieTarget = safeTarget(macros.target.calories);
    const isCalorieOverTarget = consumedCalories > calorieTarget;
    const remainingCalories = Math.max(0, calorieTarget - consumedCalories);
    const exhaustedCalories = Math.max(0, consumedCalories - calorieTarget);
    const calorieProgressPercent = Math.min(100, Math.max(0, (consumedCalories / calorieTarget) * 100));

    if (loading) {
        return (
            <SafeAreaView className="flex-1 justify-center items-center bg-appBackground">
                <ActivityIndicator size="large" color={THEME_COLORS.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-appBackground">
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
                <View className='flex-row items-center justify-between'>
                    <Text className="text-2xl font-bold mb-3 text-textDeep">Calorie Summary</Text>
                    <TouchableOpacity
                        onPress={() => router.push('/(tabs)/calorie/summary')}
                        className="flex-row items-center mb-3"
                        activeOpacity={0.75}
                    >
                        <Text className="text-sm font-semibold text-primary mr-1">See details</Text>
                        <Ionicons name="chevron-forward" size={15} color={THEME_COLORS.primary} />
                    </TouchableOpacity>
                </View>
                
                <View
                    className="rounded-2xl p-4 mb-8 bg-surface border border-borderSoft"
                    style={{
                        shadowColor: '#0F172A',
                        shadowOpacity: 0.08,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                    }}
                >
                    <View className="flex-row justify-between items-start mb-3">
                        <View className="flex-1">
                            <Text className="text-xs font-medium text-textSecondary mb-1">
                                Target
                            </Text>
                            <Text className="text-base font-bold text-textPrimary">
                                {formatWholeNumber(calorieTarget)} kcal / day
                            </Text>
                        </View>
                        <Ionicons name="ellipsis-horizontal" size={20} color="#A0AEC0" />
                    </View>

                    <View className="flex-row justify-between items-center mb-2">
                        <Text className="text-xs text-textSecondary">
                            {formatWholeNumber(consumedCalories)} consumed
                        </Text>
                        <Text className={`text-xs font-bold ${isCalorieOverTarget ? 'text-error' : 'text-success'}`}>
                            {formatWholeNumber(isCalorieOverTarget ? exhaustedCalories : remainingCalories)} {isCalorieOverTarget ? 'exhausted' : 'remaining'}
                        </Text>
                    </View>

                    <View className="h-2 rounded-full bg-macroTrack overflow-hidden mb-4">
                        <View
                            className="h-full rounded-full"
                            style={{
                                width: `${calorieProgressPercent}%`,
                                backgroundColor: isCalorieOverTarget ? THEME_COLORS.error : THEME_COLORS.success,
                            }}
                        />
                    </View>
                    
                    {/* Centered layout for the 4 key macros */}
                    <View className="flex-row justify-between items-end px-2 pb-1">
                        <CircularProgress 
                            value={macros.consumed.carbs} 
                            maxValue={safeTarget(macros.target.carbs)} 
                            radius={27}
                            strokeWidth={5}
                            color={THEME_COLORS.secondary}
                            trackColor="#E5EBF2"
                            valueColor={THEME_COLORS.textPrimary}
                            labelColor={THEME_COLORS.textSecondary}
                            percentColor={THEME_COLORS.secondary}
                            label="Carbs"
                            unit="g"
                            showConsumed={true}
                            showPercent={true}
                            animated={true}
                        />
                        <CircularProgress 
                            value={macros.consumed.fats} 
                            maxValue={safeTarget(macros.target.fats)} 
                            radius={27}
                            strokeWidth={5}
                            color={THEME_COLORS.error}
                            trackColor="#E5EBF2"
                            valueColor={THEME_COLORS.textPrimary}
                            labelColor={THEME_COLORS.textSecondary}
                            percentColor={THEME_COLORS.error}
                            label="Fat"
                            unit="g"
                            showConsumed={true}
                            showPercent={true}
                            animated={true}
                        />
                        <CircularProgress 
                            value={macros.consumed.protein} 
                            maxValue={safeTarget(macros.target.protein)} 
                            radius={27}
                            strokeWidth={5}
                            color={THEME_COLORS.primary}
                            trackColor="#E5EBF2"
                            valueColor={THEME_COLORS.textPrimary}
                            labelColor={THEME_COLORS.textSecondary}
                            percentColor={THEME_COLORS.primary}
                            label="Protein"
                            unit="g"
                            showConsumed={true}
                            showPercent={true}
                            animated={true}
                        />
                        <CircularProgress 
                            value={macros.consumed.calories} 
                            maxValue={calorieTarget} 
                            radius={27}
                            strokeWidth={5}
                            color={THEME_COLORS.success}
                            trackColor="#E5EBF2"
                            valueColor={THEME_COLORS.textPrimary}
                            labelColor={THEME_COLORS.textSecondary}
                            percentColor={THEME_COLORS.success}
                            label="Calories"
                            unit="cal"
                            showConsumed={true}
                            showPercent={true}
                            animated={true}
                        />
                    </View>
                </View>

                {/* 4. Category Grid Section */}
                <Text className="text-2xl font-bold mb-3 text-textDeep">Category</Text>
                <View className="flex-row flex-wrap pb-10">
                    {categories.map((cat, index) => (
                        <TouchableOpacity 
                            key={index}
                            onPress={() => cat.onPress ? cat.onPress() : router.push(cat.route as any)}
                            className="w-[31%] rounded-xl py-4 items-center mb-4 bg-surface border border-borderSoft"
                            style={{ marginRight: (index + 1) % 3 === 0 ? 0 : '3.5%' }}
                        >
                            <View className={`w-12 h-12 rounded-xl items-center justify-center mb-2 ${cat.iconBgClass}`}>
                                <Ionicons name={cat.icon as any} size={24} color={cat.iconColor} />
                            </View>
                            <Text className="text-textPrimary text-xs font-bold">{cat.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* 5. Food Items Section */}
                <Text className="text-2xl font-bold mb-3 text-textDeep">Recommended Foods</Text>
                {loadingFoodItems ? (
                    <View className="items-center py-8">
                        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
                    </View>
                ) : foodItems.length > 0 ? (
                    <View className="pb-10">
                        {foodItems.map((item, index) => (
                            <ComboCard
                                key={`${item?.fatsecret_food_id || item?.food_id || item?.id || item?.title || 'food'}-${index}`}
                                item={item}
                                isFavorite={!!favoriteItemKeys[getFavoriteExternalId(item)]}
                                onFavoriteChange={handleFavoriteChange}
                                onFavoriteError={() => showCustomAlert('Error', 'Could not update this favorite food.')}
                                onPress={() => {
                                    router.push({
                                        pathname: '/(tabs)/meal/comboDetail',
                                        params: { itemData: JSON.stringify(item) }
                                    });
                                }}
                                onAdd={() => openRecommendedMealSelector(item)}
                            />
                        ))}
                    </View>
                ) : (
                    <View className="items-center py-8">
                        <Text style={{ color: '#70819A', fontSize: 14 }}>No food items available</Text>
                    </View>
                )}

            </ScrollView>

            {showSuccess && (
                <SuccessModal
                    visible={showSuccess}
                    message="Meal added successfully!"
                    onClose={() => setShowSuccess(false)}
                />
            )}

            {isAddFoodModalVisible && (
                <AddFoodModal
                    visible={isAddFoodModalVisible}
                    onClose={() => setIsAddFoodModalVisible(false)}
                    mealType={activeMealType}
                    onAddFood={handleAddHomeFood}
                />
            )}

            <Modal visible={showMealSelector} transparent animationType="fade">
                <TouchableWithoutFeedback onPress={() => setShowMealSelector(false)}>
                    <View className="flex-1 bg-black/50 justify-center items-center px-4">
                        <TouchableWithoutFeedback>
                            <View className="bg-white w-full max-w-xs p-6 rounded-3xl items-center shadow-xl">
                                <Text className="text-xl font-bold text-gray-900 mb-2">Select Meal</Text>
                                <Text className="text-gray-400 text-center text-sm mb-6">When are you eating this?</Text>
                                <TouchableOpacity onPress={() => handleSelectRecommendedMeal('breakfast')} className="w-full bg-white py-4 rounded-2xl mb-3 border border-gray-100 px-4">
                                    <Text className="font-bold text-gray-700 text-base">Breakfast</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleSelectRecommendedMeal('lunch')} className="w-full bg-white py-4 rounded-2xl mb-3 border border-gray-100 px-4">
                                    <Text className="font-bold text-gray-700 text-base">Lunch</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleSelectRecommendedMeal('dinner')} className="w-full bg-white py-4 rounded-2xl mb-6 border border-gray-100 px-4">
                                    <Text className="font-bold text-gray-700 text-base">Dinner</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setShowMealSelector(false)}>
                                    <Text className="text-gray-400 font-bold">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                confirmText={alertConfig.confirmText}
                variant={alertConfig.variant}
                onConfirm={() => setAlertVisible(false)}
            />

            <SafeFullScreenModal
                visible={isGuidanceVisible}
                onRequestClose={() => setIsGuidanceVisible(false)}
                backgroundColor="#EEF3F8"
                statusBarStyle="dark"
            >
                <GuidanceContent onClose={() => setIsGuidanceVisible(false)} />
            </SafeFullScreenModal>
        </SafeAreaView>
    );
};

export default HomeScreen;
