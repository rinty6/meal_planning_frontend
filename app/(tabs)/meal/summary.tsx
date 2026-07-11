import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { authedFetch } from '../../../services/authedFetch';
import AddFoodModal from '../../../components/addfoodmodal';
import {
  fetchMealsSummaryWithCache,
  getCachedMealsSummary,
  markMealsSummaryDirty,
} from '../../../services/mealsSummaryStore';

// ---------------------------------------------------------
// 1. HELPER: Date Formatter (Local Time)
// ---------------------------------------------------------
const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ---------------------------------------------------------
// 2. HELPERS
// ---------------------------------------------------------
const getServings = (item: any) => {
  const n = Number(item?.servings);
  return Number.isFinite(n) && n > 0 ? n : 1;
};
// Display a servings count without trailing ".0" (1, 1.5, 2).
const formatServings = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const round1 = (v: any) => Math.round((Number(v) || 0) * 10) / 10;

// ---------------------------------------------------------
// 3. HELPER: MealSection Component
// ---------------------------------------------------------
const MealSection = ({ title, items, colorClass, icon, onChangeServings, onDelete, onOpenAddModal }: any) => {
  const totalKcal = items ? items.reduce((sum: number, item: any) => sum + (Number(item.calories) || 0), 0) : 0;

  return (
    <View className="mb-6">
      {/* HEADER */}
      <View className={`${colorClass} rounded-2xl p-4 mb-3 shadow-sm`}>
        <View className="flex-row justify-between items-center mb-1">
          <View className="flex-row items-center">
            <Ionicons name={icon} size={24} color="white" />
            <Text className="text-white font-bold text-xl ml-2">{title}</Text>
          </View>
          {/* Add Food Button in Header */}
          <TouchableOpacity onPress={onOpenAddModal} className="bg-white/20 px-3 py-1 rounded-full flex-row items-center">
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white font-bold ml-1 text-xs">Add Food</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-white/90 font-medium ml-8">{Math.round(totalKcal)} kcal</Text>
      </View>

      {/* ITEMS LIST */}
      {(!items || items.length === 0) ? (
        <Text className="text-gray-400 text-center italic py-4">No food logged yet.</Text>
      ) : (
        items.map((item: any) => {
          const servings = getServings(item);
          const atMin = servings <= 0.5; // next "minus" removes the item
          return (
          <View key={item.id} className="bg-white rounded-2xl p-4 mb-3 flex-row justify-between items-center border border-gray-100 shadow-sm">
            <View className="flex-1">
              <Text className="text-gray-900 font-bold text-lg">{item.foodName}</Text>
              <Text className="text-gray-500 text-xs mt-1">
                {Math.round(Number(item.calories) || 0)} kcal | P: {round1(item.protein)}g . C: {round1(item.carbs)}g . F: {round1(item.fats)}g
              </Text>
              <Text className="text-gray-400 text-xs mt-0.5">{formatServings(servings)} serving{servings === 1 ? '' : 's'}</Text>
            </View>

            {/* Controls — +/- adjust servings by 0.5 (rescales calories + macros) */}
            <View className="flex-row items-center bg-gray-50 rounded-lg p-1 space-x-3 ml-2">
              <TouchableOpacity
                onPress={() => (atMin ? onDelete(item.id) : onChangeServings(item, -0.5))}
                className="p-2 bg-white rounded-md shadow-sm"
              >
                {atMin ? <Ionicons name="trash-outline" size={18} color="#EF4444" /> : <Ionicons name="remove" size={18} color="#EF4444" />}
              </TouchableOpacity>

              <Text className="font-bold text-lg text-gray-800 w-10 text-center">{formatServings(servings)}</Text>

              <TouchableOpacity onPress={() => onChangeServings(item, 0.5)} className="p-2 bg-white rounded-md shadow-sm">
                <Ionicons name="add" size={18} color="#007BFF" />
              </TouchableOpacity>
            </View>
          </View>
          );
        })
      )}
    </View>
  );
};

// ---------------------------------------------------------
// 4. MAIN SCREEN
// ---------------------------------------------------------
export default function SummaryScreen() {
  const router = useRouter();
  const { userId, getToken } = useAuth();

  // Ref for Calendar Scroll
  const flatListRef = useRef<FlatList>(null);
  const removedTempIdsRef = useRef<Set<string>>(new Set());

  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [activeMealType, setActiveMealType] = useState('breakfast');

  // --- GENERATE DATES FOR THE MONTH ---
  const dates = useMemo(() => {
    const list = [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed (0 = Jan)
    // Get total days in current month
    const numDays = new Date(year, month + 1, 0).getDate();

    for (let i = 1; i <= numDays; i++) {
      list.push(new Date(year, month, i));
    }
    return list;
  }, []);

  // --- SCROLL TO DATE ON LOAD ---
  useEffect(() => {
    // Scroll to today's date (index = day - 1)
    if (flatListRef.current && dates.length > 0) {
      const index = selectedDate.getDate() - 1;
      // Timeout ensures FlatList is rendered before scrolling
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      }, 500);
    }
  }, [selectedDate]);

  // --- FETCH DATA ---
  const fetchMeals = useCallback(async () => {
    if (!userId) return;
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!apiURL) return;

    const dateStr = formatLocalYYYYMMDD(selectedDate);
    const cached = getCachedMealsSummary(userId, dateStr);
    if (cached && !cached.dirty) {
      setMeals(cached.meals);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const meals = await fetchMealsSummaryWithCache({
        apiURL,
        userId,
        date: dateStr,
        getToken,
      });
      if (meals) setMeals(meals);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedDate]);

  useFocusEffect(useCallback(() => { fetchMeals(); }, [fetchMeals]));

  // --- HANDLER: REMOVE ---
  const handleRemoveOne = async (id: number | string) => {
    // Optimistic Update
    setMeals(current => {
      const index = current.findIndex(m => m.id === id);
      if (index > -1) {
        const updated = [...current];
        updated.splice(index, 1);
        return updated;
      }
      return current;
    });

    try {
      const idText = String(id);
      if (idText.startsWith('temp-')) {
        removedTempIdsRef.current.add(idText);
        return;
      }
      const response = await authedFetch(`/api/meals/delete/${encodeURIComponent(idText)}`, { method: 'DELETE', getToken, clerkId: userId });
      if (!response.ok) throw new Error(`Failed to delete meal item ${idText}`);
      markMealsSummaryDirty(userId, formatLocalYYYYMMDD(selectedDate));
    } catch (e) { console.error(e); }
  };

  // --- HANDLER: CHANGE SERVINGS (optimistic PATCH) ---
  // Adjusts a logged meal's servings by ±0.5, rescaling calories + macros from the
  // per-serving value (currentTotal / currentServings). Dropping below 0.5 deletes it.
  const handleChangeServings = async (item: any, delta: number) => {
    const currentServings = getServings(item);
    const newServings = Math.round((currentServings + delta) * 2) / 2;
    if (newServings < 0.5) {
      handleRemoveOne(item.id);
      return;
    }

    const perCal = (Number(item.calories) || 0) / currentServings;
    const perProtein = (Number(item.protein) || 0) / currentServings;
    const perCarbs = (Number(item.carbs) || 0) / currentServings;
    const perFats = (Number(item.fats) || 0) / currentServings;

    const updated = {
      ...item,
      servings: newServings,
      calories: perCal * newServings,
      protein: perProtein * newServings,
      carbs: perCarbs * newServings,
      fats: perFats * newServings,
      servingDescription: `${newServings} serving${newServings === 1 ? '' : 's'}`,
    };

    // Optimistic UI — update immediately, then persist.
    setMeals((current) => current.map((m) => (m.id === item.id ? updated : m)));

    const dateStr = formatLocalYYYYMMDD(selectedDate);
    try {
      const idText = String(item.id);
      if (idText.startsWith('temp-')) return; // not persisted yet; next fetch reconciles
      const response = await authedFetch(`/api/meals/update/${encodeURIComponent(idText)}`, {
        method: 'PUT',
        getToken,
        clerkId: userId,
        body: JSON.stringify({
          servings: updated.servings,
          calories: updated.calories,
          protein: updated.protein,
          carbs: updated.carbs,
          fats: updated.fats,
          servingDescription: updated.servingDescription,
        }),
      });
      if (!response.ok) throw new Error('Failed to update servings');
      markMealsSummaryDirty(userId, dateStr);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not update servings.");
      fetchMeals(); // revert to source of truth
    }
  };

  // --- HANDLER: ADD NEW FOOD (MODAL) ---
  const handleAddNewFood = async (foodItem: any) => {
    try {
      const formattedDate = formatLocalYYYYMMDD(selectedDate);

      const payload = {
        clerkId: userId,
        date: formattedDate,
        mealType: activeMealType,
        foodName: foodItem.title,
        calories: foodItem.calories,
        protein: foodItem.protein,
        carbs: foodItem.carbs,
        fats: foodItem.fats,
        image: foodItem.image || ""
      };
      
      await authedFetch(`/api/meals/add`, {
          method: 'POST',
          getToken,
          clerkId: userId,
          body: JSON.stringify(payload)
      });
      markMealsSummaryDirty(userId, formattedDate);

      setIsAddModalVisible(false);
      fetchMeals(); // Keep fetchMeals here as Modal closing transition hides the reload well enough
    } catch (e) { console.error(e); }
  };

  const handleOpenAddModal = (type: string) => {
    setActiveMealType(type);
    setIsAddModalVisible(true);
  };

  // --- FILTERING (each row is its own line; servings live on the row) ---
  const breakfastItems = meals.filter(m => m.mealType === 'breakfast');
  const lunchItems = meals.filter(m => m.mealType === 'lunch');
  const dinnerItems = meals.filter(m => m.mealType === 'dinner');

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      {/* HEADER */}
      <View className="flex-row items-center px-5 py-4 relative justify-between">
        <TouchableOpacity onPress={() => router.back()} className="z-10 p-2 bg-gray-100 rounded-full">
          <Ionicons name="chevron-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-black">Meal Summary</Text>
        <View className="w-10" />
      </View>

      {/* CALENDAR STRIP */}
      <View className="py-4">
        <FlatList
          ref={flatListRef} // Attach Ref here
          horizontal
          data={dates}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.toISOString()}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          getItemLayout={(data, index) => ({ length: 68, offset: 68 * index, index })}
          // initialScrollIndex is unreliable alone, the useEffect + scrollTo is better
          onScrollToIndexFailed={info => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
            });
          }}
          renderItem={({ item }) => {
            const isSelected = formatLocalYYYYMMDD(item) === formatLocalYYYYMMDD(selectedDate);
            const dayName = item.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            const dayNum = item.getDate();

            return (
              <TouchableOpacity
                onPress={() => setSelectedDate(item)}
                style={{
                  backgroundColor: isSelected ? '#007BFF' : 'white',
                  borderColor: isSelected ? '#007BFF' : '#F3F4F6',
                }}
                className="items-center justify-center w-14 h-20 rounded-2xl mr-3 border"
              >
                <Text style={{ color: isSelected ? 'white' : '#9CA3AF' }} className="text-xs mb-1">
                  {dayName}
                </Text>
                <Text style={{ color: isSelected ? 'white' : '#111827' }} className="text-xl font-bold">
                  {dayNum}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* CONTENT */}
      <ScrollView className="px-5 mt-2" showsVerticalScrollIndicator={false}>
        <Text className="text-xl font-bold mb-4 text-gray-800">
          {selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
        ) : (
          <>
            <MealSection title="Breakfast" items={breakfastItems} colorClass="bg-primary" icon="partly-sunny"
              onChangeServings={handleChangeServings} onDelete={handleRemoveOne} onOpenAddModal={() => handleOpenAddModal('breakfast')} />

            <MealSection title="Lunch" items={lunchItems} colorClass="bg-secondary" icon="sunny"
              onChangeServings={handleChangeServings} onDelete={handleRemoveOne} onOpenAddModal={() => handleOpenAddModal('lunch')} />

            <MealSection title="Dinner" items={dinnerItems} colorClass="bg-dinner" icon="moon"
              onChangeServings={handleChangeServings} onDelete={handleRemoveOne} onOpenAddModal={() => handleOpenAddModal('dinner')} />

            <View className="h-20" />
          </>
        )}
      </ScrollView>

      {/* CONDITIONAL RENDERING FOR MODALS */}
      {isAddModalVisible && (
        <AddFoodModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          mealType={activeMealType}
          onAddFood={handleAddNewFood}
        />
      )}
      
    </SafeAreaView>
  );
}
