// This component create the function named "Import from the saved recipes" at the shopping page

import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

interface ImportRecipeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (recipe: any) => void;
}

const ImportRecipeModal = ({ visible, onClose, onSelect }: ImportRecipeModalProps) => {
  const { userId } = useAuth();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) loadRecipes();
  }, [visible]);

  const loadRecipes = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${apiURL}/api/favorites/list/${userId}`);
      const data = await res.json();
      setRecipes(data.savedRecipes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="h-[70%] bg-white rounded-t-3xl p-5">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold">Import Ingredients</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="black" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
          ) : (
            <FlatList 
              data={recipes}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={<Text className="text-center text-gray-400 mt-10">No saved recipes found.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  onPress={() => onSelect(item)}
                  className="p-4 border border-gray-100 rounded-xl mb-3 flex-row items-center justify-between bg-gray-50"
                >
                  <Text className="font-bold text-gray-800 text-lg">{item.title}</Text>
                  <Ionicons name="add-circle" size={24} color="#007BFF" />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export default ImportRecipeModal;