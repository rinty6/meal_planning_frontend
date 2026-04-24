// This page displays all favorite foods and saved recipes
// It collect all the datail from the database 

import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import React, { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import FavoriteCard from '../../../components/FavoriteCard';
import { getCachedFavorites, setCachedFavorites, shouldRefreshFavorites } from '../../../services/favoritesStore';

const FAVORITES_REFRESH_TTL_MS = 60 * 1000;

const FavoritesScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'foods' | 'recipes'>('foods');
  const [favoriteFoods, setFavoriteFoods] = useState<any[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const hydrateFromCache = useCallback(() => {
    if (!userId) return;
    const cached = getCachedFavorites(userId);
    if (!cached) return;
    setFavoriteFoods(cached.favoriteFoods);
    setSavedRecipes(cached.savedRecipes);
    setLoading(false);
  }, [userId]);

  // FETCH DATA
  const loadFavorites = useCallback(async ({ showSpinner = true, force = false } = {}) => {
    if (!userId) return;
    if (!force && !shouldRefreshFavorites(userId, FAVORITES_REFRESH_TTL_MS)) return;

    if (showSpinner) setLoading(true);
    try {
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${apiURL}/api/favorites/list/${userId}`);
        const data = await res.json();
        
        if (res.ok) {
            const nextFavoriteFoods = data.favoriteFoods || [];
            const nextSavedRecipes = data.savedRecipes || [];
            setFavoriteFoods(nextFavoriteFoods);
            setSavedRecipes(nextSavedRecipes);
            setCachedFavorites(userId, {
              favoriteFoods: nextFavoriteFoods,
              savedRecipes: nextSavedRecipes,
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (showSpinner) setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      const cached = getCachedFavorites(userId);
      hydrateFromCache();
      void loadFavorites({ showSpinner: !cached });
    }, [hydrateFromCache, loadFavorites, userId])
  );

  // --- DELETE HANDLER ---
  const handleDelete = async (id: number) => {
    const isFood = activeTab === 'foods';
    const endpoint = isFood ? 'delete-food' : 'delete-recipe';
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
    const nextFavoriteFoods = isFood
      ? favoriteFoods.filter((item) => item.id !== id)
      : favoriteFoods;
    const nextSavedRecipes = isFood
      ? savedRecipes
      : savedRecipes.filter((item) => item.id !== id);

    // 1. Optimistic Update (Remove from UI immediately)
    setFavoriteFoods(nextFavoriteFoods);
    setSavedRecipes(nextSavedRecipes);
    if (userId) {
      setCachedFavorites(userId, {
        favoriteFoods: nextFavoriteFoods,
        savedRecipes: nextSavedRecipes,
      });
    }

    // 2. Call Backend
    try {
        const response = await fetch(`${apiURL}/api/favorites/${endpoint}/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          throw new Error(`Failed to delete favorite ${id}`);
        }
    } catch (error) {
        console.error("Delete failed", error);
        Alert.alert("Error", "Could not delete item");
        void loadFavorites({ showSpinner: false, force: true }); // Revert on error
    }
  };

  const handlePressItem = (item: any) => {
    if (activeTab === 'recipes') {
        // Navigate to Detail Page in "Edit Mode" (passing savedRecipeId)
        router.push({
            pathname: "/(tabs)/meal/recipedetail",
            params: { savedRecipeId: item.id } 
        });
    } else {
        // Navigate to comboDetail for food items
        router.push({
            pathname: "/(tabs)/meal/comboDetail",
            params: { itemData: JSON.stringify(item) }
        });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-5 py-4 flex-row items-center relative mb-2">
        <TouchableOpacity onPress={() => router.push('/(tabs)/meal')} className="z-10 bg-gray-50 p-2 rounded-full">
          <Ionicons name="chevron-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-lg font-bold">My Favorites</Text>
      </View>

      {/* Tabs */}
      <View className="flex-row px-5 mb-6 space-x-3">
          <TouchableOpacity 
            onPress={() => setActiveTab('foods')}
            className={`flex-1 py-3 rounded-xl border ${activeTab === 'foods' ? 'bg-primary border-primary' : 'bg-white border-primary'}`}
          >
              <Text className={`text-center font-bold ${activeTab === 'foods' ? 'text-white' : 'text-primary'}`}>Favorite Foods</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setActiveTab('recipes')}
            className={`flex-1 py-3 rounded-xl border ${activeTab === 'recipes' ? 'bg-primary border-primary' : 'bg-white border-primary'}`}
          >
              <Text className={`text-center font-bold ${activeTab === 'recipes' ? 'text-white' : 'text-primary'}`}>Saved Recipes</Text>
          </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
          <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
      ) : (
          <FlatList
            data={activeTab === 'foods' ? favoriteFoods : savedRecipes}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => (
                <FavoriteCard 
                    item={item}
                    onPress={() => handlePressItem(item)}
                    onDelete={() => handleDelete(item.id)}
                />
            )}
          />
      )}
    </SafeAreaView>
  );
};

export default FavoritesScreen;
