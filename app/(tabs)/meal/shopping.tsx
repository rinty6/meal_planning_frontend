// This page shows all the shopping details with functions

import { View, Text, TouchableOpacity, FlatList, Image, ActivityIndicator } from 'react-native';
import React, { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import CreateListModal from '../../../components/CreateListModal';
import ImportRecipeModal from '../../../components/ImportRecipeModal';

const ShoppingScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false); // To toggle the + button menu

  // LOAD LISTS
  const fetchLists = async () => {
    if (!userId) return;
    setLoading(true);
    try {
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${apiURL}/api/shopping/list/${userId}`);
        const data = await res.json();
        if (res.ok) setLists(data);
    } catch(e) { console.error(e); } 
    finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { fetchLists(); }, []));

  // HANDLERS
  const handleCreateList = async (title: string) => {
      // Create empty list
      try {
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        await fetch(`${apiURL}/api/shopping/create`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ clerkId: userId, title: title, items: [] })
        });
        fetchLists();
      } catch(e) { console.error(e); }
  };

  const handleImportRecipe = async (recipe: any) => {
      // 1. Fetch full details to get ingredient names
      try {
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${apiURL}/api/favorites/custom/${recipe.id}`);
        const fullRecipe = await res.json();
        
        // 2. Extract Names
        const items = fullRecipe.ingredients.map((ing: any) => ing.name);

        // 3. Create List
        await fetch(`${apiURL}/api/shopping/create`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ clerkId: userId, title: `Shopping for ${recipe.title}`, items: items })
        });
        setShowImportModal(false);
        fetchLists();
      } catch(e) { console.error(e); }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-5 py-4 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.push('/(tabs)/meal')}><Ionicons name="chevron-back" size={28} /></TouchableOpacity>
        <Text className="font-bold text-xl">Shopping Lists</Text>
        
        {/* Plus Button with Dropdown logic */}
        <TouchableOpacity onPress={() => setShowMenu(!showMenu)} className="relative">
            <Ionicons name="add-circle" size={32} color="#007BFF" />
        </TouchableOpacity>
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

      {/* EMPTY STATE */}
      {!loading && lists.length === 0 ? (
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
