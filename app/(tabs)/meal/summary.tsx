import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import AddFoodModal from '../../../components/addfoodmodal';

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
// 2. HELPER: Grouping Logic
// ---------------------------------------------------------
const groupMeals = (meals: any[]) => {
  const grouped: { [key: string]: any } = {};

  meals.forEach((meal) => {
    // Unique key: Name + MealType + Calories
    const key = `${meal.foodName}-${meal.mealType}-${meal.calories}`;

    if (!grouped[key]) {
      grouped[key] = { ...meal, quantity: 1, ids: [meal.id] };
    } else {
      grouped[key].quantity += 1;
      grouped[key].ids.push(meal.id);
    }
  });

  return Object.values(grouped);
};

// ---------------------------------------------------------
// 3. HELPER: MealSection Component
// ---------------------------------------------------------
const MealSection = ({ title, items, colorClass, icon, onRemoveOne, onAddOne, onOpenAddModal }: any) => {
  const totalKcal = items ? items.reduce((sum: number, item: any) => sum + (item.calories * item.quantity), 0) : 0;

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
        items.map((item: any) => (
          <View key={item.id} className="bg-white rounded-2xl p-4 mb-3 flex-row justify-between items-center border border-gray-100 shadow-sm">
            <View className="flex-1">
              <Text className="text-gray-900 font-bold text-lg">{item.foodName}</Text>
              <Text className="text-gray-500 text-xs mt-1">
                {Math.round(item.calories)} kcal | P: {item.protein}g . C: {item.carbs}g . F: {item.fats}g
              </Text>
            </View>

            {/* Controls */}
            <View className="flex-row items-center bg-gray-50 rounded-lg p-1 space-x-3 ml-2">
              <TouchableOpacity onPress={() => onRemoveOne(item.ids[item.ids.length - 1])} className="p-2 bg-white rounded-md shadow-sm">
                {item.quantity === 1 ? <Ionicons name="trash-outline" size={18} color="#EF4444" /> : <Ionicons name="remove" size={18} color="#EF4444" />}
              </TouchableOpacity>

              <Text className="font-bold text-lg text-gray-800 w-8 text-center">{item.quantity}</Text>

              <TouchableOpacity onPress={() => onAddOne(item)} className="p-2 bg-white rounded-md shadow-sm">
                <Ionicons name="add" size={18} color="#007BFF" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

// ---------------------------------------------------------
// 4. MAIN SCREEN
// ---------------------------------------------------------
export default function SummaryScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  
  // Ref for Calendar Scroll
  const flatListRef = useRef<FlatList>(null);

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
    setLoading(true);
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const dateStr = formatLocalYYYYMMDD(selectedDate);
      const response = await fetch(`${apiURL}/api/meals/summary/${userId}/${dateStr}`);
      const data = await response.json();

      if (response.ok) setMeals(data);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedDate]);

  useFocusEffect(useCallback(() => { fetchMeals(); }, [fetchMeals]));

  // --- HANDLER: REMOVE ---
  const handleRemoveOne = async (id: number) => {
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
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      await fetch(`${apiURL}/api/meals/delete/${id}`, { method: 'DELETE' });
    } catch (e) { console.error(e); }
  };

  // --- FIX: OPTIMISTIC ADD DUPLICATE ---
  const handleAddDuplicate = async (item: any) => {
    // 1. Create a temp object to update UI instantly
    const newTempMeal = {
        id: `temp-${Date.now()}`, // Temporary ID
        userId,
        date: formatLocalYYYYMMDD(selectedDate),
        mealType: item.mealType,
        foodName: item.foodName,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        image: item.image || ""
    };

    // 2. Update Local State Immediately (No Reload!)
    setMeals(prev => [...prev, newTempMeal]);

    // 3. Send to Backend in Background
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const payload = {
        clerkId: userId,
        date: newTempMeal.date,
        mealType: newTempMeal.mealType,
        foodName: newTempMeal.foodName,
        calories: newTempMeal.calories,
        protein: newTempMeal.protein,
        carbs: newTempMeal.carbs,
        fats: newTempMeal.fats,
        image: newTempMeal.image
      };
      // We don't need to await the fetch for the UI to update, 
      // but waiting ensures data consistency if user leaves page.
      await fetch(`${apiURL}/api/meals/add`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
      });
      
      // Note: We DO NOT call fetchMeals() here to avoid spinner/reload.
      // The local state is already correct.
    } catch (e) { 
        console.error(e);
        Alert.alert("Error", "Could not add item.");
        // Optional: Revert local state if error occurs
        fetchMeals(); 
    }
  };

  // --- HANDLER: ADD NEW FOOD (MODAL) ---
  const handleAddNewFood = async (foodItem: any) => {
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
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
      
      await fetch(`${apiURL}/api/meals/add`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload) 
      });
      
      setIsAddModalVisible(false);
      fetchMeals(); // Keep fetchMeals here as Modal closing transition hides the reload well enough
    } catch (e) { console.error(e); }
  };

  const handleOpenAddModal = (type: string) => {
    setActiveMealType(type);
    setIsAddModalVisible(true);
  };

  // --- FILTERING ---
  const breakfastItems = groupMeals(meals.filter(m => m.mealType === 'breakfast'));
  const lunchItems = groupMeals(meals.filter(m => m.mealType === 'lunch'));
  const dinnerItems = groupMeals(meals.filter(m => m.mealType === 'dinner'));

  return (
    <SafeAreaView className="flex-1 bg-white">
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
              onRemoveOne={handleRemoveOne} onAddOne={handleAddDuplicate} onOpenAddModal={() => handleOpenAddModal('breakfast')} />

            <MealSection title="Lunch" items={lunchItems} colorClass="bg-secondary" icon="sunny"
              onRemoveOne={handleRemoveOne} onAddOne={handleAddDuplicate} onOpenAddModal={() => handleOpenAddModal('lunch')} />

            <MealSection title="Dinner" items={dinnerItems} colorClass="bg-dinner" icon="moon"
              onRemoveOne={handleRemoveOne} onAddOne={handleAddDuplicate} onOpenAddModal={() => handleOpenAddModal('dinner')} />

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