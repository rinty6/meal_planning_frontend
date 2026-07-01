import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getRecipeDetails } from '../../../services/mealAPI';
import { getThemealdbRecipe, type ThemealdbRecipe } from '../../../services/themealdbAPI';
import { markFavoritesDirty } from '../../../services/favoritesStore';
import { useAuth } from '@clerk/clerk-expo';
import { authedFetch } from '../../../services/authedFetch';
import IngredientIcon from '../../../components/IngredientIcon';
import { resolveIngredientImage } from '../../../services/ingredientImages';
import SuccessModal from '../../../components/sucessmodal'; 
import { markMealsSummaryDirty } from '../../../services/mealsSummaryStore';
import { cleanShoppingItemName, markShoppingListsDirty } from '../../../services/shoppingStore';

const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeCaloriesInput = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.max(0, Math.round(parsed))) : "0";
};

const caloriesFromInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const RecipeDetailScreen = () => {
  // 1. GET PARAMS
  const { id, previewImage, savedRecipeId, isCreating, source } = useLocalSearchParams();
  const isThemealdb = source === 'themealdb';
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const caloriesInputRef = useRef<TextInput>(null);
  const stepOffsetsRef = useRef<Record<number, number>>({});

  // 2. STATE VARIABLES
  const [loading, setLoading] = useState(true);       // Page loading state
  const [activeAction, setActiveAction] = useState<'recipe' | 'shopping' | 'meal' | null>(null);
  
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeCalories, setRecipeCalories] = useState("0");
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [baseRecipeInfo, setBaseRecipeInfo] = useState<any>(null);
  // Computed nutrition for a TheMealDB recipe (whole-recipe estimate), or null.
  const [mealdbNutrition, setMealdbNutrition] = useState<ThemealdbRecipe['nutrition'] | null>(null);
  // Hero image: real photo if present, else an ingredient-image collage fallback.
  const [heroFailed, setHeroFailed] = useState(false);
  // Track ingredient image URLs that fail to load so we fall back to the icon.
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  
  // Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showMealSelector, setShowMealSelector] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successAction, setSuccessAction] = useState<'recipe' | 'shopping' | 'meal' | null>(null);

  // 3. INITIALIZATION LOGIC
  useEffect(() => {
    if (isCreating === "true") {
        // --- CREATE MODE ---
        setLoading(false);
        setRecipeTitle(""); 
        setRecipeCalories("0");
        setIngredients([{ name: "", quantity: "", description: "", image: null }]);
        setInstructions([{ step: 1, text: "" }]);
        setBaseRecipeInfo({ id: `custom-${Date.now()}` }); 
    } 
    else if (savedRecipeId) {
        // --- EDIT MODE ---
        loadSavedRecipe();
    } else if (isThemealdb) {
        // --- VIEW MODE (TheMealDB / Explore by cuisine) ---
        loadThemealdbDetails();
    } else {
        // --- VIEW MODE (FatSecret) ---
        loadFatSecretDetails();
    }
  }, [id, savedRecipeId, isCreating, isThemealdb]);

  // --- LOADERS ---
  const loadFatSecretDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
        const data = await getRecipeDetails(id as string);
        if (data) {
            setRecipeTitle(data.title);
            setRecipeCalories(normalizeCaloriesInput(data.calories));
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

  // TheMealDB recipes arrive in the unified model. Nutrition is intentionally
  // left as "estimate pending" (calories 0) until Phase 2 precomputes it; the
  // measure string maps to the editable "quantity" field, and ingredient images
  // resolve through the same resolver used for FatSecret/custom recipes.
  const loadThemealdbDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
        const data = await getThemealdbRecipe(id as string);
        if (data) {
            const n = data.nutrition;
            const hasComputed = !!n && n.status === "computed" && typeof n.calories === "number";
            setMealdbNutrition(hasComputed ? n : null);
            setRecipeTitle(data.title);
            setRecipeCalories(hasComputed ? normalizeCaloriesInput(n.calories) : "0");
            setIngredients(
              (data.ingredients || []).map((ing) => ({
                name: ing.name,
                quantity: ing.measure || "",
                description: "",
                image: ing.image || null, // TheMealDB ingredient thumbnail; falls back to icon on error
              }))
            );
            setInstructions(
              (data.instructions || []).map((text, i) => ({ step: i + 1, text }))
            );
            setBaseRecipeInfo({
              id: `themealdb-${data.id}`,
              image: data.image || (previewImage as string),
              title: data.title,
              cuisine: data.cuisine,
              category: data.category,
              protein: hasComputed ? n.protein ?? 0 : 0,
              carbs: hasComputed ? n.carbs ?? 0 : 0,
              fats: hasComputed ? n.fats ?? 0 : 0,
              source: 'themealdb',
            });
        }
    } catch (e) {
        console.error("Error loading TheMealDB recipe", e);
    } finally {
        setLoading(false);
    }
  };

  const loadSavedRecipe = async () => {
    setLoading(true);
    try {
        const res = await authedFetch(`/api/favorites/custom/${savedRecipeId}`, { getToken, clerkId: userId });
        const data = await res.json();

        if (data) {
            setRecipeTitle(data.title);
            setRecipeCalories(normalizeCaloriesInput(data.calories));
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

  const scrollStepIntoView = (index: number) => {
    setTimeout(() => {
      const y = stepOffsetsRef.current[index] ?? 0;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
    }, 120);
  };

  // --- SAVE / UPDATE LOGIC ---
  const handleSaveOrUpdate = async () => {
    if (!userId) return;
    setActiveAction('recipe');

    try {
        if (savedRecipeId) {
            // --- UPDATE EXISTING ---
            const res = await authedFetch(`/api/favorites/update-recipe/${savedRecipeId}`, {
                method: 'PUT',
                getToken,
                clerkId: userId,
                body: JSON.stringify({
                    title: recipeTitle,
                    calories: caloriesFromInput(recipeCalories),
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
                calories: caloriesFromInput(recipeCalories),
                protein: baseRecipeInfo?.protein || 0,
                carbs: baseRecipeInfo?.carbs || 0,
                fats: baseRecipeInfo?.fats || 0,
                ingredients: ingredients, 
                instructions: instructions 
            };

            const res = await authedFetch(`/api/favorites/save-custom`, {
                method: 'POST',
                getToken,
                clerkId: userId,
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
      .map((ingredient) => cleanShoppingItemName(ingredient?.name))
      .filter(Boolean);

    setActiveAction('shopping');
    try {
      const response = await authedFetch(`/api/shopping/create`, {
        method: 'POST',
        getToken,
        clerkId: userId,
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
      markShoppingListsDirty(userId);
      setShowSuccessModal(true);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not save this recipe to your shopping list.");
    } finally {
      setActiveAction(null);
    }
  };

  const handleAddToMealLog = () => {
    if (!userId) {
      Alert.alert("Error", "You must be logged in to add this recipe to your meal log.");
      return;
    }
    setShowMealSelector(true);
  };

  const handleSelectMeal = (mealType: 'breakfast' | 'lunch' | 'dinner') => {
    setShowMealSelector(false);
    void saveRecipeToMealLog(mealType);
  };

  const saveRecipeToMealLog = async (mealType: 'breakfast' | 'lunch' | 'dinner') => {
    if (!userId) return;

    const date = formatLocalYYYYMMDD(new Date());
    const recipeName = recipeTitle.trim() || baseRecipeInfo?.title || "My Custom Recipe";

    setActiveAction('meal');
    try {
      const response = await authedFetch(`/api/meals/add`, {
        method: 'POST',
        getToken,
        clerkId: userId,
        body: JSON.stringify({
          clerkId: userId,
          date,
          mealType,
          foodName: recipeName,
          calories: caloriesFromInput(recipeCalories),
          protein: Number(baseRecipeInfo?.protein) || 0,
          carbs: Number(baseRecipeInfo?.carbs) || 0,
          fats: Number(baseRecipeInfo?.fats) || 0,
          image: baseRecipeInfo?.image || (previewImage as string) || "",
          externalId: baseRecipeInfo?.id || savedRecipeId || id || recipeName,
          source: savedRecipeId || isCreating === "true"
            ? "custom_recipe"
            : isThemealdb ? "themealdb_recipe" : "fatsecret_recipe",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add recipe to meal log");
      }

      markMealsSummaryDirty(userId, date);
      setSuccessAction('meal');
      setSuccessMessage("Meal added successfully!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not add this recipe to your meal log.");
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

  // Hero: prefer the recipe photo; fall back to a collage of ingredient images
  // (reuses the curated ingredient set + TheMealDB thumbnails) for imageless recipes.
  const heroImage = baseRecipeInfo?.image && String(baseRecipeInfo.image).trim() !== ""
    ? String(baseRecipeInfo.image) : null;
  const collageTiles = Array.from(new Set(
    ingredients
      .map((i: any) => i.image || resolveIngredientImage(i.name))
      .filter((u: any): u is string => !!u)
  )).slice(0, 4);
  const sourceLabel = isThemealdb ? "Recipe via TheMealDB"
    : (savedRecipeId || isCreating === "true") ? null : "Recipe via FatSecret";

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

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        ref={scrollViewRef}
        className="px-5"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: 180 }}
      >
         {/* HERO IMAGE — real photo, else an ingredient-image collage */}
         {(heroImage && !heroFailed) ? (
            <Image
               source={{ uri: heroImage }}
               className="w-full h-48 rounded-2xl mb-3"
               resizeMode="cover"
               onError={() => setHeroFailed(true)}
            />
         ) : collageTiles.length > 0 ? (
            <View className="w-full h-32 rounded-2xl mb-3 overflow-hidden flex-row bg-gray-50 border border-gray-100">
               {collageTiles.map((uri, idx) => (
                  <View key={idx} className="flex-1 items-center justify-center border-r border-gray-100 p-2">
                     <Image source={{ uri }} className="w-full h-full" resizeMode="contain" />
                  </View>
               ))}
            </View>
         ) : null}

         {/* SOURCE LABEL */}
         {sourceLabel && (
            <View className="flex-row mb-2">
               <View className="bg-gray-100 rounded-full px-2.5 py-1">
                  <Text className="text-gray-500 text-xs">{sourceLabel}</Text>
               </View>
            </View>
         )}

         {/* TITLE INPUT */}
         <TextInput
            value={recipeTitle}
            onChangeText={setRecipeTitle}
            className="text-2xl font-bold text-gray-900 mb-2 leading-tight border-b border-gray-200 pb-2"
            multiline
            placeholder="Name your recipe..."
            placeholderTextColor="#9CA3AF"
         />

         <View className="flex-row items-center mb-6 h-8">
            <Ionicons name="flame" size={16} color="#FF9500" />
            <TextInput
              ref={caloriesInputRef}
              value={recipeCalories}
              onChangeText={(text) => setRecipeCalories(text.replace(/[^0-9.]/g, ""))}
              onBlur={() => setRecipeCalories(normalizeCaloriesInput(recipeCalories))}
              keyboardType="numeric"
              className="ml-2 text-base font-bold text-gray-700 border-b border-gray-200 px-1"
              style={{ minWidth: 44, height: 28, paddingTop: 0, paddingBottom: 0, lineHeight: 20, textAlignVertical: 'center' }}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            />
            <Text className="text-base font-bold text-gray-500 ml-1 leading-5">kcal</Text>
            <TouchableOpacity
              onPress={() => caloriesInputRef.current?.focus()}
              className="ml-2 w-7 h-7 rounded-full bg-blue-50 items-center justify-center"
            >
              <Ionicons name="create-outline" size={15} color="#007BFF" />
            </TouchableOpacity>
         </View>

         {/* TheMealDB nutrition is computed from ingredients — be honest it's an estimate. */}
         {isThemealdb && (
            mealdbNutrition ? (
               <View className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 -mt-4 mb-6">
                  <Text className="text-secondary font-bold text-xs">Estimated · whole recipe</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                     ≈ P {Math.round(mealdbNutrition.protein ?? 0)}g · C {Math.round(mealdbNutrition.carbs ?? 0)}g · F {Math.round(mealdbNutrition.fats ?? 0)}g, calculated from ingredients (USDA).{mealdbNutrition.lowConfidence ? ' Rough estimate.' : ''}
                  </Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                     Edit the calories above before logging a single portion.
                  </Text>
               </View>
            ) : (
               <View className="flex-row items-center -mt-4 mb-6">
                  <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
                  <Text className="text-gray-400 text-xs ml-1">
                     Nutrition estimate coming soon — edit the calories to log it now.
                  </Text>
               </View>
            )
         )}

         {/* FatSecret recipes: same box layout, but accurate source data (not our estimate). */}
         {sourceLabel === "Recipe via FatSecret" && baseRecipeInfo && (
            <View className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 -mt-4 mb-6">
               <Text className="text-primary font-bold text-xs">Nutrition via FatSecret · per serving</Text>
               <Text className="text-gray-500 text-xs mt-0.5">
                  P {Math.round(Number(baseRecipeInfo.protein) || 0)}g · C {Math.round(Number(baseRecipeInfo.carbs) || 0)}g · F {Math.round(Number(baseRecipeInfo.fats) || 0)}g
                  {baseRecipeInfo.servings > 1 ? ` · makes ${baseRecipeInfo.servings} servings` : ''}
               </Text>
            </View>
         )}

         {/* INGREDIENTS SECTION */}
         <View className="flex-row justify-between items-center mb-4">
             <Text className="text-lg font-bold">Ingredients</Text>
             <TouchableOpacity onPress={handleAddIngredient} className="bg-primary px-3 py-1 rounded-full flex-row items-center">
                 <Ionicons name="add" size={16} color="white" />
                 <Text className="text-white font-bold ml-1 text-xs">Add ingredient</Text>
             </TouchableOpacity>
         </View>

         <View className="mb-8">
             {ingredients.map((ing, index) => {
                 const candidateImage = ing.image || resolveIngredientImage(ing.name);
                 const resolvedImage = candidateImage && !failedImages[candidateImage] ? candidateImage : null;
                 return (
                 <View key={index} className="flex-row items-center mb-4 bg-white">
                     <View className="w-16 h-16 bg-gray-50 rounded-2xl items-center justify-center overflow-hidden border border-gray-100 mr-4">
                        {resolvedImage ? (
                             <Image
                                source={{ uri: resolvedImage }}
                                className="w-full h-full"
                                resizeMode="contain"
                                onError={() => setFailedImages((prev) => ({ ...prev, [resolvedImage]: true }))}
                             />
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
                 );
             })}
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
                <View
                    key={index}
                    onLayout={(event) => {
                      stepOffsetsRef.current[index] = event.nativeEvent.layout.y;
                    }}
                    className="flex-row items-start mb-4 border border-blue-200/50 rounded-2xl p-4 bg-white shadow-sm"
                >
                    <Text className="text-lg font-bold text-gray-400 mr-3 mt-1">{String(index + 1).padStart(2, '0')}</Text>
                    <TextInput 
                        value={inst.text}
                        onChangeText={(text) => handleUpdateStep(text, index)}
                        onFocus={() => scrollStepIntoView(index)}
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
         <View className="mb-10">
             <TouchableOpacity 
                onPress={handleAddToMealLog}
                disabled={!!activeAction}
                className={`w-full py-4 rounded-xl shadow-md flex-row justify-center items-center mb-3 ${activeAction ? 'bg-blue-300' : 'bg-primary'}`}
             >
                 {activeAction === 'meal' ? (
                     <ActivityIndicator size="small" color="white" />
                 ) : (
                    <>
                      <Ionicons name="add" size={18} color="white" />
                      <Text className="text-white text-center font-bold text-base ml-2">Add to meal log</Text>
                    </>
                 )}
             </TouchableOpacity>

             <View className="flex-row gap-2">
               <TouchableOpacity 
                  onPress={handleSaveOrUpdate} 
                  disabled={!!activeAction} 
                  className={`flex-1 py-3 rounded-xl border flex-row justify-center items-center ${activeAction ? 'border-blue-300 bg-blue-50' : 'border-primary bg-white'}`}
               >
                   {activeAction === 'recipe' ? (
                       <ActivityIndicator size="small" color="#007BFF" />
                   ) : (
                      <>
                        <Ionicons name="heart-outline" size={15} color="#007BFF" />
                        <Text className="text-primary text-center font-bold text-sm ml-1" numberOfLines={1}>
                          {savedRecipeId ? "Update Recipe" : "Save Recipe"}
                        </Text>
                      </>
                   )}
               </TouchableOpacity>

               <TouchableOpacity 
                  onPress={handleSaveToShoppingList}
                  disabled={!!activeAction}
                  className={`flex-1 py-3 rounded-xl border flex-row justify-center items-center ${activeAction ? 'border-orange-200 bg-orange-50' : 'border-secondary bg-white'}`}
               >
                   {activeAction === 'shopping' ? (
                       <ActivityIndicator size="small" color="#FF9500" />
                   ) : (
                      <>
                        <Ionicons name="bag-handle-outline" size={15} color="#FF9500" />
                        <Text className="text-secondary text-center font-bold text-sm ml-1" numberOfLines={1}>
                          Shopping List
                        </Text>
                      </>
                   )}
               </TouchableOpacity>
             </View>
         </View>

      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showMealSelector} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowMealSelector(false)}>
          <View className="flex-1 bg-black/50 justify-center items-center px-4">
            <TouchableWithoutFeedback>
              <View className="bg-white w-full max-w-xs p-6 rounded-3xl items-center shadow-xl">
                <Text className="text-xl font-bold text-gray-900 mb-2">Select Meal</Text>
                <Text className="text-gray-400 text-center text-sm mb-6">When are you eating this?</Text>
                <TouchableOpacity onPress={() => handleSelectMeal('breakfast')} className="w-full bg-white py-4 rounded-2xl mb-3 border border-gray-100 px-4">
                  <Text className="font-bold text-gray-700 text-base">Breakfast</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSelectMeal('lunch')} className="w-full bg-white py-4 rounded-2xl mb-3 border border-gray-100 px-4">
                  <Text className="font-bold text-gray-700 text-base">Lunch</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSelectMeal('dinner')} className="w-full bg-white py-4 rounded-2xl mb-6 border border-gray-100 px-4">
                  <Text className="font-bold text-gray-700 text-base">Dinner</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowMealSelector(false)}>
                  <Text className="text-gray-400 font-bold">Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <SuccessModal 
        visible={showSuccessModal}
        message={successMessage}
        onClose={handleCloseModal}
      />
      
    </SafeAreaView>
  );
};

export default RecipeDetailScreen;
