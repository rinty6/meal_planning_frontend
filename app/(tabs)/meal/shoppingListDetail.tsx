import { View, Text, TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';
import { authedFetch } from '../../../services/authedFetch';
import {
  changeCachedShoppingListItemCount,
  cleanShoppingItemName,
  clearCachedShoppingItems,
  fetchShoppingItemsWithCache,
  getCachedShoppingItems,
  markShoppingItemsDirty,
  markShoppingListsDirty,
  removeCachedShoppingItem,
  removeCachedShoppingList,
  resetCachedShoppingItems,
  setCachedShoppingItemChecked,
  setCachedShoppingItemName,
  shouldRefreshShoppingItems,
} from '../../../services/shoppingStore';

const SHOPPING_ITEMS_REFRESH_TTL_MS = 60 * 1000;

const ShoppingListDetail = () => {
  const { listId, title } = useLocalSearchParams();
  const listIdParam = Array.isArray(listId) ? listId[0] : listId;
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [items, setItems] = useState<any[]>([]);
  const [newItemText, setNewItemText] = useState("");

  // ALERT STATE
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    onConfirm: () => {},
  });

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // --- HELPER: SHOW ALERT ---
  const showAlert = (title: string, message: string, confirmText: string, onConfirm: () => void) => {
    setAlertConfig({ title, message, confirmText, cancelText: "Cancel", onConfirm });
    setAlertVisible(true);
  };

  const loadItems = useCallback(async ({ force = false } = {}) => {
    if (!userId || !listIdParam) {
      setItems([]);
      return;
    }

    if (!force && !shouldRefreshShoppingItems(userId, listIdParam, SHOPPING_ITEMS_REFRESH_TTL_MS)) {
      return;
    }

    try {
        const data = await fetchShoppingItemsWithCache({
          userId,
          listId: listIdParam,
          getToken: getTokenRef.current,
          ttlMs: SHOPPING_ITEMS_REFRESH_TTL_MS,
          force,
        });
        if (data) setItems(data);
    } catch (e) { console.error(e); }
  }, [listIdParam, userId]);

  useEffect(() => {
    if (!userId || !listIdParam) {
      setItems([]);
      return;
    }

    const cached = getCachedShoppingItems(userId, listIdParam);
    if (cached) setItems(cached.items);
    void loadItems({ force: !cached });
  }, [listIdParam, loadItems, userId]);

  const toggleItem = async (id: number, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setItems(prev => prev.map(i => i.id === id ? { ...i, isChecked: nextStatus } : i));
    if (userId && listIdParam) {
      setCachedShoppingItemChecked(userId, listIdParam, id, nextStatus);
    }
    try {
        const response = await authedFetch(`/api/shopping/toggle/${id}`, {
            method: 'PUT',
            getToken,
            clerkId: userId,
            body: JSON.stringify({ isChecked: nextStatus })
        });
        if (!response.ok) throw new Error("Failed to toggle shopping item");
    } catch (e) {
      console.error(e);
      void loadItems({ force: true });
    }
  };

  const handleTextChange = (id: number, text: string) => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, name: text } : i));
  };

  const saveItemName = async (id: number, name: string) => {
      const cleanedName = cleanShoppingItemName(name);
      setItems(prev => prev.map(i => i.id === id ? { ...i, name: cleanedName } : i));
      if (userId && listIdParam) {
        setCachedShoppingItemName(userId, listIdParam, id, cleanedName);
      }
      try {
        const response = await authedFetch(`/api/shopping/update-item/${id}`, {
            method: 'PUT',
            getToken,
            clerkId: userId,
            body: JSON.stringify({ name: cleanedName })
        });
        if (!response.ok) throw new Error("Failed to save item name");
      } catch (e) {
        console.error("Failed to save name", e);
        void loadItems({ force: true });
      }
  };

  const deleteItem = async (id: number) => {
      setItems(prev => prev.filter(i => i.id !== id));
      if (userId && listIdParam) {
        removeCachedShoppingItem(userId, listIdParam, id);
        changeCachedShoppingListItemCount(userId, listIdParam, -1);
      }
      try {
        const response = await authedFetch(`/api/shopping/delete-item/${id}`, { method: 'DELETE', getToken, clerkId: userId });
        if (!response.ok) throw new Error("Failed to delete shopping item");
      } catch (e) {
        console.error(e);
        markShoppingListsDirty(userId);
        markShoppingItemsDirty(userId, listIdParam);
        void loadItems({ force: true });
      }
  };

  // RESET LIST WITH CUSTOM ALERT
  const handleResetList = () => {
      showAlert(
          "Reuse List",
          "This will uncheck all items so you can use this list again. Continue?",
          "Reset",
          async () => {
              setAlertVisible(false);
              setItems(prev => prev.map(i => ({ ...i, isChecked: false }))); // Optimistic
              if (userId && listIdParam) {
                resetCachedShoppingItems(userId, listIdParam);
              }
              try {
                const response = await authedFetch(`/api/shopping/reset-list/${listIdParam}`, { method: 'PUT', getToken, clerkId: userId });
                if (!response.ok) throw new Error("Failed to reset shopping list");
              } catch (e) {
                console.error(e);
                void loadItems({ force: true });
              }
          }
      );
  };

  const addItem = async () => {
    const cleanedName = cleanShoppingItemName(newItemText);
    if (!cleanedName || !listIdParam) return;
    try {
        const response = await authedFetch(`/api/shopping/add-item`, {
            method: 'POST',
            getToken,
            clerkId: userId,
            body: JSON.stringify({ listId: listIdParam, name: cleanedName })
        });
        if (!response.ok) throw new Error("Failed to add shopping item");
        setNewItemText("");
        if (userId) {
          changeCachedShoppingListItemCount(userId, listIdParam, 1);
          markShoppingItemsDirty(userId, listIdParam);
        }
        void loadItems({ force: true });
    } catch (e) { console.error(e); }
  };

  // DELETE LIST WITH CUSTOM ALERT
  const handleDeleteList = () => {
      showAlert(
          "Delete List",
          "Are you sure you want to delete this shopping list? This cannot be undone.",
          "Delete",
          async () => {
              setAlertVisible(false);
              try {
                const response = await authedFetch(`/api/shopping/delete/${listIdParam}`, { method: 'DELETE', getToken, clerkId: userId });
                if (!response.ok) throw new Error("Failed to delete shopping list");
                if (userId && listIdParam) {
                  removeCachedShoppingList(userId, listIdParam);
                  clearCachedShoppingItems(userId, listIdParam);
                }
                router.back();
              } catch (e) { console.error(e); }
          }
      );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-5 py-4 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={28} /></TouchableOpacity>
        <Text className="flex-1 font-bold text-xl mx-3" numberOfLines={2}>
          {title}
        </Text>
        {/* Uses Custom Alert Logic now */}
        <TouchableOpacity onPress={handleDeleteList}><Ionicons name="trash-outline" size={24} color="red" /></TouchableOpacity>
      </View>

      {/* List */}
      <FlatList 
        data={items}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        renderItem={({ item }) => (
            <View className="flex-row items-center mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <TouchableOpacity onPress={() => toggleItem(item.id, item.isChecked)} className="mr-3">
                    <Ionicons 
                        name={item.isChecked ? "checkbox" : "square-outline"} 
                        size={28} 
                        color={item.isChecked ? "#007BFF" : "gray"} 
                    />
                </TouchableOpacity>

                <TextInput 
                    value={item.name}
                    onChangeText={(text) => handleTextChange(item.id, text)}
                    onEndEditing={() => saveItemName(item.id, item.name)} 
                    className={`flex-1 text-lg ${item.isChecked ? 'text-gray-400 line-through' : 'text-black'}`}
                    placeholder="Item name..."
                    placeholderTextColor="#9CA3AF"
                />

                <TouchableOpacity onPress={() => deleteItem(item.id)} className="ml-2 p-2">
                    <Ionicons name="close" size={20} color="#9CA3AF" />
                </TouchableOpacity>
            </View>
        )}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={10}>
          
          {/* REFRESH BUTTON (Uses Custom Alert) */}
          <View className="items-end px-5 mb-2">
              <TouchableOpacity onPress={handleResetList} className="flex-row items-center bg-gray-100 px-4 py-2 rounded-full">
                  <Ionicons name="refresh" size={16} color="#007BFF" />
                  <Text className="text-primary font-bold ml-2">Refresh List</Text>
              </TouchableOpacity>
          </View>

          {/* Add Item Input */}
          <View className="px-5 py-4 border-t border-gray-100 flex-row items-center bg-white">
              <TextInput 
                value={newItemText} 
                onChangeText={setNewItemText} 
                placeholder="+ Add item..." 
                placeholderTextColor="#9CA3AF"
                className="flex-1 bg-gray-100 p-4 rounded-full text-base mr-3 text-black"
              />
              <TouchableOpacity onPress={addItem} className="bg-primary p-3 rounded-full">
                  <Ionicons name="arrow-up" size={24} color="white" />
              </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>

      {/* CUSTOM ALERT COMPONENT */}
      <CustomAlert 
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
        onCancel={() => setAlertVisible(false)}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
      />

    </SafeAreaView>
  );
};

export default ShoppingListDetail;
