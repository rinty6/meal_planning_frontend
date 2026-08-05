import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import CircularProgress from '../../components/CircularProgress';
import NextFeatureShowcase from '../../components/NextFeatureShowcase';
import AddFoodModal from '../../components/addfoodmodal';
import SuccessModal from '../../components/sucessmodal';
import CustomAlert from '../../components/customAlert';
import GuidanceContent from '../../components/GuidanceContent';
import SafeFullScreenModal from '../../components/SafeFullScreenModal';
import NotificationMessage from '../../components/notificationmessage';
import FeedbackSendingMessage from '../../components/feedbacksendingmessage';
import {
    getCachedHomeSnapshot,
    shouldRefreshHomeDashboard,
    subscribeToHomeData,
} from '../../services/homeStore';
import {
    fetchMealsSummaryWithCache,
    getCachedMealsSummary,
    markMealsSummaryDirty,
} from '../../services/mealsSummaryStore';
import PipReminderCard from '../../components/pip/PipReminderCard';
import { extractLoggedMealTypes, resolvePipCard } from '../../components/pip/pipHomeState';
import { authedFetch } from '../../services/authedFetch';
import {
    fetchAndCacheHomeDashboard,
    buildTargetMacros,
    getTodayFormatted,
    toNumber,
    firstNumber,
    DEFAULT_CALORIE_TARGET,
    type MacroSet,
} from '../../services/homeDashboard';

type MealLogType = 'breakfast' | 'lunch' | 'dinner';

const HOME_DASHBOARD_REFRESH_TTL_MS = 15 * 1000;
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

const formatWholeNumber = (value: number) =>
    Math.round(value).toLocaleString('en-US');

const safeTarget = (value: number) => Math.max(1, toNumber(value));

// Macro helpers (toNumber, firstNumber, buildTargetMacros, getTodayFormatted, …) and the
// dashboard fetch now live in services/homeDashboard.ts so app/index.tsx can pre-warm the
// same cache during the startup animation (IMPLEMENTATION_CHECKLIST §4A).

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

const getDefaultMealLogType = (date = new Date()): MealLogType => {
    const hour = date.getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 17) return 'lunch';
    return 'dinner';
};

const getFoodExternalId = (item: any) =>
    String(item?.externalId || item?.external_id || item?.fatsecret_food_id || item?.food_id || item?.recipe_id || item?.id || '').trim();

const HomeScreen = () => {
    const router = useRouter();
    const { userId, getToken } = useAuth(); // Clerk ID
    const { user: clerkUser } = useUser();
    const getTokenRef = useRef(getToken);

    useEffect(() => {
        getTokenRef.current = getToken;
    }, [getToken]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setCurrentHour((previous) => {
                const next = new Date().getHours();
                return next === previous ? previous : next;
            });
        }, 60 * 1000);
        return () => clearInterval(intervalId);
    }, []);
    
    // Start already-loaded when the startup screen pre-warmed the cache — avoids a
    // one-frame white spinner flash on arrival (IMPLEMENTATION_CHECKLIST §4A.5 / E22).
    const [loading, setLoading] = useState(() => !getCachedHomeSnapshot(userId)?.macros);
    const [dbUserName, setDbUserName] = useState('');
    
    // Macro State
    const [macros, setMacros] = useState({
        consumed: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        target: buildTargetMacros(DEFAULT_CALORIE_TARGET)
    });
    // Whether `macros.target` is the user's real goal or the 2000 kcal placeholder.
    // Pip must not show an emotional state off a fabricated target (Error 066).
    const [targetResolved, setTargetResolved] = useState(
        () => getCachedHomeSnapshot(userId)?.targetResolved ?? false
    );
    // Which meals are already logged today, or null until that data arrives.
    const [loggedMealTypes, setLoggedMealTypes] = useState<Set<MealLogType> | null>(null);
    // Pip's state depends on the hour, so a screen left open must not keep saying
    // "Time for lunch?" at 3pm. Only re-renders when the hour actually rolls over.
    const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
    // Guards the async meals read against setting state after the screen blurs.
    const isScreenActiveRef = useRef(true);
    // Stops overlapping dashboard fetches when several mutations land at once.
    // A skipped refresh is safe: the store's dirty flag is only cleared by a
    // successful write, so the next focus or notification picks it up.
    const dashboardInFlightRef = useRef(false);

    const [isAddFoodModalVisible, setIsAddFoodModalVisible] = useState(false);
    const [activeMealType, setActiveMealType] = useState<MealLogType>('breakfast');
    const [showSuccess, setShowSuccess] = useState(false);
    const [isGuidanceVisible, setIsGuidanceVisible] = useState(false);
    const [isNotificationMessagesVisible, setIsNotificationMessagesVisible] = useState(false);
    const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
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
            setTargetResolved(cached.targetResolved);
            setLoading(false);
        }
    }, [userId]);

    /**
     * Reads today's meals for the Pip card. Goes through the shared meals cache,
     * which is TTL'd and dedupes in-flight requests, so this costs nothing when
     * the Meal tabs have already fetched it (Errors 014 / 059 / 067).
     */
    const loadTodayMeals = useCallback(async () => {
        if (!userId) return;
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        if (!apiURL) return;

        const meals = await fetchMealsSummaryWithCache({
            apiURL,
            userId,
            date: getTodayFormatted(),
            getToken: getTokenRef.current,
        });

        if (!isScreenActiveRef.current || !meals) return;
        setLoggedMealTypes(extractLoggedMealTypes(meals));
    }, [userId]);

    const loadDashboardData = useCallback(async ({ showSpinner = true } = {}) => {
        if (!userId) {
            setLoading(false);
            return;
        }
        if (dashboardInFlightRef.current) return;
        dashboardInFlightRef.current = true;

        if (showSpinner) setLoading(true);
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            if (!apiURL) {
                setLoading(false);
                return;
            }

            // Delegates to the shared fetch (same logic StartScreen pre-warms with).
            const result = await fetchAndCacheHomeDashboard({
                apiURL,
                userId,
                getToken: getTokenRef.current,
                fallbackName: clerkUser?.firstName,
            });

            if (result.ok) {
                setDbUserName(result.dbUserName);
                setMacros(result.macros);
                setTargetResolved(result.targetResolved);
            }
        } catch (error) {
            console.error("Dashboard Load Error:", error);
        } finally {
            dashboardInFlightRef.current = false;
            if (showSpinner) setLoading(false);
        }
    }, [userId, clerkUser?.firstName]);

    /**
     * Refresh when a meal changes anywhere in the app.
     *
     * The focus effect below cannot cover the voice-search modal: it renders over
     * the active tab from the tabs layout, so Home never blurs and never
     * re-focuses while it is used. Subscribing is what makes a voice-logged meal
     * update the dashboard and the Pip card without leaving the screen.
     */
    useEffect(() => {
        const unsubscribe = subscribeToHomeData(() => {
            if (!isScreenActiveRef.current) return;
            void loadDashboardData({ showSpinner: false });
            void loadTodayMeals();
        });
        return unsubscribe;
    }, [loadDashboardData, loadTodayMeals]);

    useFocusEffect(useCallback(() => {
        let isActive = true;
        isScreenActiveRef.current = true;

        const initializeHomeScreen = () => {
            const cached = getCachedHomeSnapshot(userId);
            hydrateFromCache();
            if (!isActive) return;

            // Synchronous read first so the Pip card renders its real state on the
            // very first frame whenever another tab has already loaded today's meals.
            const cachedMeals = getCachedMealsSummary(userId, getTodayFormatted());
            if (cachedMeals) {
                setLoggedMealTypes(extractLoggedMealTypes(cachedMeals.meals));
            }

            const shouldRefreshDashboard = shouldRefreshHomeDashboard(userId, HOME_DASHBOARD_REFRESH_TTL_MS) || !cached?.macros;

            if (shouldRefreshDashboard) {
                void loadDashboardData({ showSpinner: !cached?.macros });
            }

            void loadTodayMeals();
        };

        initializeHomeScreen();

        return () => {
            isActive = false;
            isScreenActiveRef.current = false;
        };
    }, [hydrateFromCache, loadDashboardData, loadTodayMeals, userId]));

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

            const response = await authedFetch(`/api/meals/add`, {
                method: 'POST',
                getToken: getTokenRef.current,
                clerkId: userId,
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
                    externalId: getFoodExternalId(foodItem),
                    source: foodItem.source || foodItem.type || '',
                    servingId: foodItem.servingId || foodItem.serving_id || '',
                    servingDescription: foodItem.servingDescription || foodItem.serving_description || '',
                    nutrients: foodItem.nutrients || {},
                }),
            });

            if (!response.ok) throw new Error('Could not save food');

            markMealsSummaryDirty(userId, getTodayFormatted());
            setIsAddFoodModalVisible(false);
            setShowSuccess(true);
            void loadDashboardData({ showSpinner: false });
            // Refresh the Pip card so a just-logged meal clears its reminder.
            void loadTodayMeals();
        } catch (error) {
            console.error('Home add food error:', error);
            showCustomAlert('Error', 'Failed to add food item.');
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
        { name: 'Feedback', icon: 'chatbubble-outline', onPress: () => setIsFeedbackVisible(true), iconColor: THEME_COLORS.textSecondary, iconBgClass: 'bg-neutralSoft' },
    ];

    const consumedCalories = Math.max(0, toNumber(macros.consumed.calories));
    const calorieTarget = safeTarget(macros.target.calories);
    const isCalorieOverTarget = consumedCalories > calorieTarget;
    const remainingCalories = Math.max(0, calorieTarget - consumedCalories);
    const exhaustedCalories = Math.max(0, consumedCalories - calorieTarget);
    const calorieProgressPercent = Math.min(100, Math.max(0, (consumedCalories / calorieTarget) * 100));

    // Pip's home state. Recomputed only when its real inputs move, so a re-render
    // never restarts the animation on its own.
    const pipCard = React.useMemo(
        () => resolvePipCard({
            calorieTarget,
            consumedCalories,
            hour: currentHour,
            loggedMealTypes,
            targetResolved,
        }),
        [calorieTarget, consumedCalories, currentHour, loggedMealTypes, targetResolved]
    );

    const handleOpenPipCard = () => {
        setActiveMealType(pipCard.mealType ?? getDefaultMealLogType());
        setIsAddFoodModalVisible(true);
    };

    if (loading) {
        return (
            <SafeAreaView className="flex-1 justify-center items-center bg-background" edges={['top', 'left', 'right']}>
                <ActivityIndicator size="large" color={THEME_COLORS.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
            <ScrollView className="px-4 pt-4" showsVerticalScrollIndicator={false}>

                {/* 1. Header Section */}
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
                    <TouchableOpacity onPress={() => setIsNotificationMessagesVisible(true)} className="relative p-2">
                        <Ionicons name="notifications-outline" size={24} color="#64748B" />
                        <View className="absolute top-1 right-2 w-2.5 h-2.5 rounded-full border border-white" style={{ backgroundColor: '#EF4444' }} />
                    </TouchableOpacity>
                </View>

                {/* 2. Pip reminder card (replaced the hero image) */}
                <PipReminderCard model={pipCard} onPress={handleOpenPipCard} />

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
                <View className="flex-row flex-wrap pb-6">
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

                {/* 5. Next Feature Showcase */}
                <NextFeatureShowcase />

            </ScrollView>

            {showSuccess && (
                <SuccessModal
                    visible={showSuccess}
                    message="Meal added successfully!"
                    pip="eating"
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

            <SafeFullScreenModal
                visible={isNotificationMessagesVisible}
                onRequestClose={() => setIsNotificationMessagesVisible(false)}
                backgroundColor="#F3F4F6"
                statusBarStyle="dark"
            >
                <NotificationMessage onClose={() => setIsNotificationMessagesVisible(false)} />
            </SafeFullScreenModal>

            <SafeFullScreenModal
                visible={isFeedbackVisible}
                onRequestClose={() => setIsFeedbackVisible(false)}
                backgroundColor="#FFFFFF"
                statusBarStyle="dark"
            >
                <FeedbackSendingMessage
                    closeIcon="close"
                    onClose={() => setIsFeedbackVisible(false)}
                    onSubmitted={() => setIsFeedbackVisible(false)}
                />
            </SafeFullScreenModal>

            {/* DEV ONLY — entry point for the Pip rig preview. Remove before the release build. */}
            {__DEV__ && (
                <TouchableOpacity
                    onPress={() => router.push('/pip-preview')}
                    style={{
                        position: 'absolute',
                        right: 16,
                        bottom: 24,
                        backgroundColor: '#2B7BE0',
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        shadowColor: '#0F172A',
                        shadowOpacity: 0.25,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 4,
                    }}
                >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Pip preview</Text>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
};

export default HomeScreen;
