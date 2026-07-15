// This page displays all favorite foods and saved recipes
// It collect all the datail from the database 

import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import FavoriteCard from '../../../components/FavoriteCard';
import { authedFetch } from '../../../services/authedFetch';
import {
  getCachedFavorites,
  removeFavoriteFromCache,
  setCachedFavorites,
  shouldRefreshFavorites,
} from '../../../services/favoritesStore';

const FAVORITES_REFRESH_TTL_MS = 60 * 1000;
type FavoritesTab = 'foods' | 'recipes';

// Match the Shopping screen's empty-state language: one neutral icon, one clear
// status line, and one primary action that takes the user to the relevant discovery page.
const FavoritesEmptyState = ({
  activeTab,
  onPress,
}: {
  activeTab: FavoritesTab;
  onPress: () => void;
}) => {
  const isFoodsTab = activeTab === 'foods';

  return (
    <View className="flex-1 items-center justify-center px-5">
      <Ionicons
        name={isFoodsTab ? 'heart-outline' : 'book-outline'}
        size={80}
        color="#D1D5DB"
      />
      <Text className="text-xl font-bold text-gray-400 mt-4 mb-8">
        {isFoodsTab ? 'No Favorite Foods Yet' : 'No Saved Recipes Yet'}
      </Text>

      <TouchableOpacity onPress={onPress} className="bg-primary w-full py-4 rounded-2xl">
        <Text className="text-white text-center font-bold text-lg">
          {isFoodsTab ? 'Explore Meal Plans' : 'Browse Recipes'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const FavoritesScreen = () => {
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const deletingItemKeysRef = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<FavoritesTab>('foods');
  const [favoriteFoods, setFavoriteFoods] = useState<any[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingItemKeys, setDeletingItemKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

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
        const res = await authedFetch(`/api/favorites/list/${userId}`, { getToken: getTokenRef.current, clerkId: userId });
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
    if (!userId) {
      Alert.alert("Could not delete item", "Please sign in again and retry.");
      return;
    }

    const isFood = activeTab === 'foods';
    const itemKey = `${activeTab}:${id}`;
    if (deletingItemKeysRef.current.has(itemKey)) return;

    deletingItemKeysRef.current.add(itemKey);
    setDeletingItemKeys(new Set(deletingItemKeysRef.current));

    const endpoint = isFood ? 'delete-food' : 'delete-recipe';

    // Keep the row visible but disable its delete button until the server confirms.
    // This closes the small double-tap window that previously sent duplicate DELETEs.
    try {
        const response = await authedFetch(`/api/favorites/${endpoint}/${id}`, {
          method: 'DELETE',
          getToken: getTokenRef.current,
          clerkId: userId,
        });
        const payload = await response.json().catch(() => null);

        // Backward compatibility with an older deployed backend: a 404 still means
        // the desired state has been reached, so do not show a false deletion error.
        if (!response.ok && response.status !== 404) {
          const serverMessage = payload?.error || payload?.message || 'Could not delete item';
          throw new Error(`${serverMessage} (HTTP ${response.status})`);
        }

        if (isFood) {
          setFavoriteFoods((current) => current.filter((item) => item.id !== id));
        } else {
          setSavedRecipes((current) => current.filter((item) => item.id !== id));
        }
        removeFavoriteFromCache(userId, isFood ? 'foods' : 'recipes', id);
    } catch (error) {
        console.error("Delete failed", error);
        const message = error instanceof Error ? error.message : 'Could not delete item';
        Alert.alert("Could not delete item", message);
    } finally {
        deletingItemKeysRef.current.delete(itemKey);
        setDeletingItemKeys(new Set(deletingItemKeysRef.current));
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

  const activeItems = activeTab === 'foods' ? favoriteFoods : savedRecipes;
  const handleEmptyStateAction = () => {
    router.push(activeTab === 'foods' ? '/(tabs)/meal/planning' : '/(tabs)/meal/recipe');
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
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
            data={activeItems}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 24,
              flexGrow: activeItems.length === 0 ? 1 : undefined,
            }}
            ListEmptyComponent={(
              <FavoritesEmptyState
                activeTab={activeTab}
                onPress={handleEmptyStateAction}
              />
            )}
            renderItem={({ item }) => (
                <FavoriteCard 
                    item={item}
                    onPress={() => handlePressItem(item)}
                    onDelete={() => handleDelete(item.id)}
                    isDeleting={deletingItemKeys.has(`${activeTab}:${item.id}`)}
                />
            )}
          />
      )}
    </SafeAreaView>
  );
};

export default FavoritesScreen;
