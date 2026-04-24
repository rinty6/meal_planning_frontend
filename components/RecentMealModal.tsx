//This file creates a component which helps show the lastest meal by meal time line

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import IngredientIcon from './IngredientIcon';

interface RecentMealsModalProps {
  visible: boolean;
  onClose: () => void;
  onAddSelected: (meals: any[]) => void;
}

const RecentMealsModal = ({ visible, onClose, onAddSelected }: RecentMealsModalProps) => {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [recentMeals, setRecentMeals] = useState<any>({ breakfast: [], lunch: [], dinner: [] });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Load data & reset selection when the modal opens
  useEffect(() => {
    if (visible) {
      fetchRecentMeals();
      setSelectedIds(new Set());
    }
  }, [visible]);

  const fetchRecentMeals = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${apiURL}/api/meals/recent/${userId}`);
      const data = await res.json();
      if (res.ok) {
        setRecentMeals(data);
      }
    } catch (error) {
      console.error('Failed to fetch recent meals:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (meal: any) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(meal.id)) {
      newSet.delete(meal.id);
    } else {
      newSet.add(meal.id);
    }
    setSelectedIds(newSet);
  };

  const handleAdd = () => {
    const allMeals = [...recentMeals.breakfast, ...recentMeals.lunch, ...recentMeals.dinner];
    const selectedMeals = allMeals.filter(m => selectedIds.has(m.id));
    onAddSelected(selectedMeals);
  };

  const renderSection = (title: string, meals: any[]) => {
    if (!meals || meals.length === 0) return null;

    return (
      <View className="mb-6">
        <Text className="text-blue-500 font-bold uppercase tracking-widest text-xs mb-3 ml-1">{title}</Text>
        {meals.map((meal) => {
          const isSelected = selectedIds.has(meal.id);
          return (
            <TouchableOpacity
              key={meal.id}
              onPress={() => toggleSelection(meal)}
              className={`flex-row items-center p-3 rounded-2xl mb-3 border ${isSelected ? 'border-primary bg-blue-50/50' : 'border-gray-100 bg-white'}`}
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
            >
              <Ionicons
                name={isSelected ? "checkbox" : "square-outline"}
                size={24}
                color={isSelected ? "#007BFF" : "#D1D5DB"}
                className="mr-3"
              />
              <View className="w-14 h-14 bg-gray-50 rounded-xl overflow-hidden items-center justify-center border border-gray-100">
                {meal.image ? (
                  <Image source={{ uri: meal.image }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <IngredientIcon ingredientName={meal.foodName} size={30} />
                )}
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-gray-900 font-bold text-base" numberOfLines={1}>{meal.foodName}</Text>
                <View className="flex-row items-center mt-1">
                  <Ionicons name="flame-outline" size={14} color="#FF9500" />
                  <Text className="text-gray-500 text-xs ml-1 mr-3">{Math.round(meal.calories)} kcal</Text>
                  <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                  <Text className="text-gray-500 text-xs ml-1">10 min</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="h-[85%] bg-white rounded-t-3xl p-5 pb-8 flex-col shadow-xl">
          
          {/* --- HEADER --- */}
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-bold text-[#0A2540]">Recent Meals</Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {/* --- CONTENT --- */}
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#007BFF" />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
              {renderSection('Breakfast', recentMeals.breakfast)}
              {renderSection('Lunch', recentMeals.lunch)}
              {renderSection('Dinner', recentMeals.dinner)}

              {recentMeals.breakfast.length === 0 && recentMeals.lunch.length === 0 && recentMeals.dinner.length === 0 && (
                <Text className="text-center text-gray-400 mt-10 text-base">No recent meals found.</Text>
              )}
            </ScrollView>
          )}

          {/* --- BOTTOM BUTTON --- */}
          <View className="pt-4 mt-2">
            <TouchableOpacity
              onPress={handleAdd}
              disabled={selectedIds.size === 0}
              className={`w-full py-4 rounded-2xl items-center flex-row justify-center ${selectedIds.size > 0 ? 'bg-primary' : 'bg-gray-300'}`}
            >
              <Text className="text-white font-bold text-lg">
                Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} Meals
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
};

export default RecentMealsModal;