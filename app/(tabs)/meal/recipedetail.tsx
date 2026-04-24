import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, TextInput } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getRecipeDetails } from '../../../services/mealAPI'; 
import { markFavoritesDirty } from '../../../services/favoritesStore';
import { useAuth } from '@clerk/clerk-expo';
import IngredientIcon from '../../../components/IngredientIcon';
import SuccessModal from '../../../components/sucessmodal'; 
import Food3DIcon from '../../../components/Food3DIcon';

const RecipeDetailScreen = () => {
  // 1. GET PARAMS
  const { id, previewImage, savedRecipeId, isCreating } = useLocalSearchParams(); 
  const router = useRouter();
  const { userId } = useAuth();

  // 2. STATE VARIABLES
  const [loading, setLoading] = useState(true);       // Page loading state
  const [activeAction, setActiveAction] = useState<'recipe' | 'shopping' | null>(null);
  
  const [recipeTitle, setRecipeTitle] = useState("");
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [baseRecipeInfo, setBaseRecipeInfo] = useState<any>(null);
  
  // Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState<'recipe' | 'shopping' | null>(null);

  // 3. INITIALIZATION LOGIC
  useEffect(() => {
    if (isCreating === "true") {
        // --- CREATE MODE ---
        setLoading(false);
        setRecipeTitle(""); 
        setIngredients([{ name: "", quantity: "", description: "", image: null }]);
        setInstructions([{ step: 1, text: "" }]);
        setBaseRecipeInfo({ id: `custom-${Date.now()}` }); 
    } 
    else if (savedRecipeId) {
        // --- EDIT MODE ---
        loadSavedRecipe();
    } else {
        // --- VIEW MODE (FatSecret) ---
        loadFatSecretDetails();
    }
  }, [id, savedRecipeId, isCreating]);

  // --- LOADERS ---
  const loadFatSecretDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
        const data = await getRecipeDetails(id as string);
        if (data) {
            setRecipeTitle(data.title);
            setIngredients(data.ingredients);
            setInstructions(data.instructions);
            setBaseRecipeInfo({ ...data, image: data.image || (previewImage as string) });
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const loadSavedRecipe = async () => {
    setLoading(true);
    try {
        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${apiURL}/api/favorites/custom/${savedRecipeId}`);
        const data = await res.json();
        
        if (data) {
            setRecipeTitle(data.title);
            setIngredients(data.ingredients);
            setInstructions(data.instructions);
            setBaseRecipeInfo(data);
        }
    } catch (e) {
        console.error("Error loading saved recipe", e);
    } finally {
        setLoading(false);
    }
  };

  // --- EDITING HANDLERS ---
  const handleRemoveIngredient = (index: number) => {
    const updated = [...ingredients];
    updated.splice(index, 1);
    setIngredients(updated);
  };

  const handleUpdateIngredient = (text: string, index: number, field: 'name' | 'quantity') => {
    const updated = [...ingredients];
    updated[index][field] = text;
    setIngredients(updated);
  };

  const handleAddIngredient = () => {
    setIngredients([{ name: "", quantity: "", description: "", image: null }, ...ingredients]);
  };

  const handleRemoveStep = (index: number) => {
    const updated = [...instructions];
    updated.splice(index, 1);
    const reordered = updated.map((item, i) => ({ ...item, step: i + 1 }));
    setInstructions(reordered);
  };

  const handleUpdateStep = (text: string, index: number) => {
    const updated = [...instructions];
    updated[index].text = text;
    setInstructions(updated);
  };

  const handleAddStep = () => {
    setInstructions([...instructions, { step: instructions.length + 1, text: "" }]);
  };

  // --- SAVE / UPDATE LOGIC ---
  const handleSaveOrUpdate = async () => {
    if (!userId) return;
    setActiveAction('recipe');
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;

    try {
        if (savedRecipeId) {
            // --- UPDATE EXISTING ---
            const res = await fetch(`${apiURL}/api/favorites/update-recipe/${savedRecipeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: recipeTitle,
                    ingredients: ingredients,
                    instructions: instructions
                })
            });

            if (res.ok) {
                markFavoritesDirty(userId);
                setSuccessAction('recipe');
                setSuccessMessage("Recipe updated successfully!");
                setShowSuccessModal(true);
            }
        } else {
            // --- SAVE NEW ---
             const payload = {
                clerkId: userId,
                externalId: baseRecipeInfo?.id || `custom-${Date.now()}`,
                title: recipeTitle || "My Custom Recipe",
                image: baseRecipeInfo?.image || "",
                prepTime: baseRecipeInfo?.prepTime || 0,
                cookTime: baseRecipeInfo?.cookTime || 0,
                servings: baseRecipeInfo?.servings || 1,
                calories: baseRecipeInfo?.calories || 0,
                protein: baseRecipeInfo?.protein || 0,
                carbs: baseRecipeInfo?.carbs || 0,
                fats: baseRecipeInfo?.fats || 0,
                ingredients: ingredients, 
                instructions: instructions 
            };

            const res = await fetch(`${apiURL}/api/favorites/save-custom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                markFavoritesDirty(userId);
                setSuccessAction('recipe');
                setSuccessMessage("Recipe saved to favorites!");
                setShowSuccessModal(true);
            }
        }
    } catch (e) {
        console.error(e);
        Alert.alert("Error", "Operation failed");
    } finally {
        setActiveAction(null);
    }
  };

  const handleSaveToShoppingList = async () => {
    if (!userId) return;

    const title = recipeTitle.trim() || baseRecipeInfo?.title || "My Custom Recipe";
    const shoppingItems = ingredients
      .map((ingredient) => {
        const quantity = String(ingredient?.quantity || "").trim();
        const name = String(ingredient?.name || "").trim();
        return [quantity, name].filter(Boolean).join(" ").trim();
      })
      .filter(Boolean);

    setActiveAction('shopping');
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const response = await fetch(`${apiURL}/api/shopping/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerkId: userId,
          title,
          items: shoppingItems,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save shopping list");
      }

      setSuccessAction('shopping');
      setSuccessMessage("Recipe ingredients saved to shopping list!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not save this recipe to your shopping list.");
    } finally {
      setActiveAction(null);
    }
  };
  
  const handleCloseModal = () => {
      setShowSuccessModal(false);
      // Navigate back after saving
      if (successAction === 'recipe' && (savedRecipeId || isCreating === "true")) {
          router.back();
      }
      setSuccessAction(null);
  };

  if (loading) return (
    <SafeAreaView className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" color="#007BFF" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER */}
      <View className="px-5 py-4 flex-row items-center relative">
        <TouchableOpacity onPress={() => router.back()} className="z-10 p-2">
           <Ionicons name="chevron-back" size={28} color="black" />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-lg font-bold">
            {isCreating === "true" ? "Create Recipe" : savedRecipeId ? "Edit Recipe" : "Recipe Detail"}
        </Text>
      </View>

      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
         {/* TITLE INPUT */}
         <TextInput 
            value={recipeTitle}
            onChangeText={setRecipeTitle}
            className="text-2xl font-bold text-gray-900 mb-6 leading-tight border-b border-gray-200 pb-2"
            multiline
            placeholder="Name your recipe..."
            placeholderTextColor="#9CA3AF"
         />

         {/* INGREDIENTS SECTION */}
         <View className="flex-row justify-between items-center mb-4">
             <Text className="text-lg font-bold">Ingredients</Text>
             <TouchableOpacity onPress={handleAddIngredient} className="bg-primary px-3 py-1 rounded-full flex-row items-center">
                 <Ionicons name="add" size={16} color="white" />
                 <Text className="text-white font-bold ml-1 text-xs">Add ingredient</Text>
             </TouchableOpacity>
         </View>

         <View className="mb-8">
             {ingredients.map((ing, index) => (
                 <View key={index} className="flex-row items-center mb-4 bg-white">
                     <View className="w-16 h-16 bg-gray-50 rounded-2xl items-center justify-center overflow-hidden border border-gray-100 mr-4">
                        {ing.image ? (
                             <Image source={{ uri: ing.image }} className="w-full h-full" resizeMode="cover" />
                        ) : (
                             <IngredientIcon ingredientName={ing.name} size={28} color="#9CA3AF" />
                        )}
                     </View>

                     <View className="flex-1">
                         <TextInput 
                            value={ing.name}
                            onChangeText={(text) => handleUpdateIngredient(text, index, 'name')}
                            className="font-bold text-base border-b border-gray-100 p-0 mb-1 h-8"
                            placeholder="Name"
                            placeholderTextColor="#9CA3AF"
                         />
                         <TextInput 
                            value={ing.quantity}
                            onChangeText={(text) => handleUpdateIngredient(text, index, 'quantity')}
                            className="text-gray-500 text-sm border-b border-gray-100 p-0 h-6"
                            placeholder="Quantity"
                            placeholderTextColor="#9CA3AF"
                         />
                     </View>

                     <TouchableOpacity onPress={() => handleRemoveIngredient(index)} className="p-3">
                         <Ionicons name="trash-outline" size={20} color="#EF4444" />
                     </TouchableOpacity>
                 </View>
             ))}
         </View>

         {/* STEPS SECTION */}
         <View className="flex-row justify-between items-center mb-4">
             <Text className="text-lg font-bold">Preparation Steps</Text>
             <TouchableOpacity onPress={handleAddStep} className="bg-primary px-3 py-1 rounded-full flex-row items-center">
                 <Ionicons name="add" size={16} color="white" />
                 <Text className="text-white font-bold ml-1 text-xs">Add step</Text>
             </TouchableOpacity>
         </View>

         <View className="mb-8">
            {instructions.map((inst, index) => (
                <View key={index} className="flex-row items-start mb-4 border border-blue-200/50 rounded-2xl p-4 bg-white shadow-sm">
                    <Text className="text-lg font-bold text-gray-400 mr-3 mt-1">{String(index + 1).padStart(2, '0')}</Text>
                    <TextInput 
                        value={inst.text}
                        onChangeText={(text) => handleUpdateStep(text, index)}
                        multiline
                        placeholder="Describe this step..."
                        placeholderTextColor="#9CA3AF"
                        className="flex-1 text-gray-700 leading-5 mt-0 pt-1 text-base"
                    />
                    <TouchableOpacity onPress={() => handleRemoveStep(index)} className="ml-2 mt-1">
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            ))}
         </View>
         
         {/* Footer Button */}
         <View className="flex-row gap-3 mb-10">
             <TouchableOpacity 
                onPress={handleSaveOrUpdate} 
                disabled={!!activeAction} 
                className={`flex-1 py-4 rounded-2xl shadow-md flex-row justify-center items-center ${activeAction ? 'bg-blue-300' : 'bg-primary'}`}
             >
                 {activeAction === 'recipe' ? (
                     <ActivityIndicator size="small" color="white" />
                 ) : (
                     <Text className="text-white text-center font-bold text-lg">
                        {savedRecipeId ? "Update Recipe" : "Save Recipe"}
                     </Text>
                 )}
             </TouchableOpacity>

             <TouchableOpacity 
                onPress={handleSaveToShoppingList}
                disabled={!!activeAction}
                className="flex-1 py-4 rounded-2xl shadow-md flex-row justify-center items-center bg-secondary"
             >
                 {activeAction === 'shopping' ? (
                     <ActivityIndicator size="small" color="white" />
                 ) : (
                     <Text className="text-white text-center font-bold text-lg">
                        Save to Shopping List
                     </Text>
                 )}
             </TouchableOpacity>
         </View>

      </ScrollView>

      <SuccessModal 
        visible={showSuccessModal}
        message={successMessage}
        onClose={handleCloseModal}
      />
      
    </SafeAreaView>
  );
};

export default RecipeDetailScreen;
