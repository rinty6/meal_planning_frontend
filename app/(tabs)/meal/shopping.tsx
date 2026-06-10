// This page shows all the shopping details with functions

import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import React, { useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { authedFetch } from '../../../services/authedFetch';
import CreateListModal from '../../../components/CreateListModal';
import ImportRecipeModal from '../../../components/ImportRecipeModal';

const ShoppingScreen = () => {
  const router = useRouter();
  const { userId, getToken } = useAuth();

  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // To toggle the + button menu
  const hasLoadedListsRef = useRef(false);
  const latestFetchRef = useRef(0);

  // LOAD LISTS
  const fetchLists = useCallback(async ({ showInitialLoader = false } = {}) => {
    const requestId = latestFetchRef.current + 1;
    latestFetchRef.current = requestId;

    if (!userId) {
      setLists([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const shouldShowInitialLoader = showInitialLoader && !hasLoadedListsRef.current;
    if (shouldShowInitialLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
        const res = await authedFetch(`/api/shopping/list/${userId}`, { getToken, clerkId: userId });
        const data = await res.json();
        if (latestFetchRef.current !== requestId) return;
        if (res.ok) setLists(Array.isArray(data) ? data : []);
    } catch(e) { console.error(e); } 
    finally {
      if (latestFetchRef.current === requestId) {
        hasLoadedListsRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void fetchLists({ showInitialLoader: true });
  }, [fetchLists]));

  // HANDLERS
  const handleCreateList = async (title: string) => {
      // Create empty list
      try {
        await authedFetch(`/api/shopping/create`, {
            method: 'POST',
            getToken,
            clerkId: userId,
            body: JSON.stringify({ clerkId: userId, title: title, items: [] })
        });
        await fetchLists();
      } catch(e) { console.error(e); }
  };

  const handleImportRecipe = async (recipe: any) => {
      // 1. Fetch full details to get ingredient names
      try {
        const res = await authedFetch(`/api/favorites/custom/${recipe.id}`, { getToken, clerkId: userId });
        const fullRecipe = await res.json();

        // 2. Extract Names
        const items = fullRecipe.ingredients.map((ing: any) => ing.name);

        // 3. Create List
        await authedFetch(`/api/shopping/create`, {
            method: 'POST',
            getToken,
            clerkId: userId,
            body: JSON.stringify({ clerkId: userId, title: `Shopping for ${recipe.title}`, items: items })
        });
        setShowImportModal(false);
        await fetchLists();
      } catch(e) { console.error(e); }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-5 py-4 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.push('/(tabs)/meal')}><Ionicons name="chevron-back" size={28} /></TouchableOpacity>
        <Text className="font-bold text-xl">Shopping Lists</Text>
        
        <View className="flex-row items-center">
            {refreshing && <ActivityIndicator size="small" color="#007BFF" style={{ marginRight: 10 }} />}
            {/* Plus Button with Dropdown logic */}
            <TouchableOpacity onPress={() => setShowMenu(!showMenu)} className="relative">
                <Ionicons name="add-circle" size={32} color="#007BFF" />
            </TouchableOpacity>
        </View>
      </View>

      {/* DROPDOWN MENU FOR PLUS BUTTON */}
      {showMenu && (
          <View className="absolute top-24 right-5 bg-white shadow-xl border border-gray-100 rounded-xl p-2 z-50 w-48">
              <TouchableOpacity onPress={() => {setShowMenu(false); setShowCreateModal(true);}} className="p-3 border-b border-gray-100 flex-row items-center">
                  <Ionicons name="list" size={18} color="black" />
                  <Text className="ml-2 font-bold">Create New List</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {setShowMenu(false); setShowImportModal(true);}} className="p-3 flex-row items-center">
                  <Ionicons name="download-outline" size={18} color="black" />
                  <Text className="ml-2 font-bold">Import Recipe</Text>
              </TouchableOpacity>
          </View>
      )}

      {/* LOADING STATE */}
      {loading ? (
          <View className="flex-1 items-center justify-center px-10">
              <ActivityIndicator size="large" color="#007BFF" />
              <Text className="text-gray-400 font-semibold mt-4">Loading shopping lists...</Text>
          </View>
      ) : lists.length === 0 ? (
      /* EMPTY STATE */
          <View className="flex-1 items-center justify-center px-10">
              <Ionicons name="basket-outline" size={80} color="#D1D5DB" />
              <Text className="text-xl font-bold text-gray-400 mt-4 mb-8">No Shopping Lists Yet</Text>
              
              <TouchableOpacity onPress={() => setShowCreateModal(true)} className="bg-primary w-full py-4 rounded-2xl mb-4">
                  <Text className="text-white text-center font-bold text-lg">Create New List</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => setShowImportModal(true)} className="bg-white border border-primary w-full py-4 rounded-2xl">
                  <Text className="text-primary text-center font-bold text-lg">Import from Favorites</Text>
              </TouchableOpacity>
          </View>
      ) : (
          /* LIST OF LISTS */
          <FlatList 
            data={lists}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ padding: 20 }}
            refreshing={refreshing}
            onRefresh={() => fetchLists()}
            renderItem={({ item }) => (
                <TouchableOpacity 
                    onPress={() => router.push({ pathname: '/(tabs)/meal/shoppingListDetail', params: { listId: item.id, title: item.title } })}
                    className="bg-blue-50 p-5 rounded-2xl mb-4 border border-blue-100 flex-row items-center"
                >
                    <View className="flex-1 pr-4">
                        <Text className="font-bold text-lg text-gray-900" numberOfLines={2} ellipsizeMode="tail">
                          {item.title}
                        </Text>
                        <Text className="text-gray-500 text-sm mt-1">{item.itemCount} items</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="gray" />
                </TouchableOpacity>
            )}
          />
      )}

      {/* MODALS */}
      <CreateListModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreateList} />
      <ImportRecipeModal visible={showImportModal} onClose={() => setShowImportModal(false)} onSelect={handleImportRecipe} />

    </SafeAreaView>
  );
};

export default ShoppingScreen;
