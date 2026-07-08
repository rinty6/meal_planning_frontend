import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getRecipeDetails } from '../../../services/mealAPI';
import { getThemealdbRecipe, type ThemealdbRecipe } from '../../../services/themealdbAPI';
import { markFavoritesDirty } from '../../../services/favoritesStore';
import { useAuth } from '@clerk/clerk-expo';
import { authedFetch } from '../../../services/authedFetch';
import { uploadRecipeImage } from '../../../services/recipeImages';
import IngredientIcon from '../../../components/IngredientIcon';
import { resolveIngredientImage } from '../../../services/ingredientImages';
import SuccessModal from '../../../components/sucessmodal'; 
import { markMealsSummaryDirty } from '../../../services/mealsSummaryStore';
import { cleanShoppingItemName, markShoppingListsDirty } from '../../../services/shoppingStore';
import { formatServingsLabel } from '../../../services/servingLabel';

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

// Macros keep one decimal (e.g. "105.0g" in the design) and clamp to >= 0.
const normalizeMacroInput = (value: any) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return String(Math.round(Math.max(0, parsed) * 10) / 10);
};

const macroFromInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

// The serving pill is free text (e.g. "10 servings", "Whole recipe"), but persistence
// still needs an integer count, so pull the first number out and fall back to 1.
const parseServingsCount = (text: string) => {
  const match = String(text || "").match(/\d+(?:\.\d+)?/);
  const n = match ? Math.round(Number(match[0])) : 0;
  return n > 0 ? n : 1;
};

const RecipeDetailScreen = () => {
  // 1. GET PARAMS
  const { id, previewImage, savedRecipeId, isCreating, source } = useLocalSearchParams();
  const isThemealdb = source === 'themealdb';
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const stepOffsetsRef = useRef<Record<number, number>>({});

  // 2. STATE VARIABLES
  const [loading, setLoading] = useState(true);       // Page loading state
  const [activeAction, setActiveAction] = useState<'recipe' | 'shopping' | 'meal' | null>(null);
  
  const [recipeTitle, setRecipeTitle] = useState("");
  const [recipeCalories, setRecipeCalories] = useState("0");
  // Editable macros + free-text serving label (per the redesign, editable in every state).
  const [recipeProtein, setRecipeProtein] = useState("0");
  const [recipeCarbs, setRecipeCarbs] = useState("0");
  const [recipeFats, setRecipeFats] = useState("0");
  const [servingText, setServingText] = useState("");
  // Tap-to-edit: each value shows as clean Text (like Food detail) until its pencil
  // is tapped, which flips just that one field into an inline input while editing.
  const [editingCalories, setEditingCalories] = useState(false);
  const [editingServing, setEditingServing] = useState(false);
  const [editingFat, setEditingFat] = useState(false);
  const [editingProtein, setEditingProtein] = useState(false);
  const [editingCarbs, setEditingCarbs] = useState(false);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [baseRecipeInfo, setBaseRecipeInfo] = useState<any>(null);
  // Computed nutrition for a TheMealDB recipe (whole-recipe estimate), or null.
  const [mealdbNutrition, setMealdbNutrition] = useState<ThemealdbRecipe['nutrition'] | null>(null);
  // Hero image: real photo if present, else an ingredient-image collage fallback.
  const [heroFailed, setHeroFailed] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
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
        setRecipeProtein("0");
        setRecipeCarbs("0");
        setRecipeFats("0");
        setServingText("");
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
            // FatSecret recipe macros are per serving; number_of_servings falls back to 1.
            setRecipeProtein(normalizeMacroInput(data.protein));
            setRecipeCarbs(normalizeMacroInput(data.carbs));
            setRecipeFats(normalizeMacroInput(data.fats));
            setServingText(formatServingsLabel(data.servings));
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
            // TheMealDB macros are a whole-recipe estimate (USDA), not per serving.
            setRecipeProtein(hasComputed ? normalizeMacroInput(n.protein) : "0");
            setRecipeCarbs(hasComputed ? normalizeMacroInput(n.carbs) : "0");
            setRecipeFats(hasComputed ? normalizeMacroInput(n.fats) : "0");
            setServingText("Whole recipe");
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
            setRecipeProtein(normalizeMacroInput(data.protein));
            setRecipeCarbs(normalizeMacroInput(data.carbs));
            setRecipeFats(normalizeMacroInput(data.fats));
            setServingText(data.servings ? formatServingsLabel(data.servings) : "");
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

  // --- PHOTO UPLOAD HANDLERS ---
  const pickAndUploadImage = async (source: 'camera' | 'library') => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          `Please allow access to your ${source === 'camera' ? 'camera' : 'photo library'} to add a recipe photo.`
        );
        return;
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.5,
        base64: true,
      };

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled || !result.assets?.[0]?.base64) return;

      setUploadingImage(true);
      const mimeType = result.assets[0].mimeType || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${result.assets[0].base64}`;
      const uploadedUrl = await uploadRecipeImage({ dataUri, getToken, clerkId: userId });

      setBaseRecipeInfo((prev: any) => ({ ...(prev || {}), image: uploadedUrl }));
      setHeroFailed(false);
    } catch (error) {
      console.error('Recipe photo upload error:', error);
      Alert.alert('Upload failed', 'Could not upload this photo. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert('Recipe Photo', 'Choose a photo source', [
      { text: 'Take Photo', onPress: () => void pickAndUploadImage('camera') },
      { text: 'Choose from Library', onPress: () => void pickAndUploadImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
                    protein: macroFromInput(recipeProtein),
                    carbs: macroFromInput(recipeCarbs),
                    fats: macroFromInput(recipeFats),
                    servings: parseServingsCount(servingText),
                    ingredients: ingredients,
                    instructions: instructions,
                    image: baseRecipeInfo?.image || ""
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
                servings: parseServingsCount(servingText),
                calories: caloriesFromInput(recipeCalories),
                protein: macroFromInput(recipeProtein),
                carbs: macroFromInput(recipeCarbs),
                fats: macroFromInput(recipeFats),
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
          protein: macroFromInput(recipeProtein),
          carbs: macroFromInput(recipeCarbs),
          fats: macroFromInput(recipeFats),
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
    <SafeAreaView className="flex-1 bg-white justify-center items-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color="#007BFF" />
    </SafeAreaView>
  );

  // Compact recipe image (130x160 beside the title) — prefer the real photo, else a
  // neutral placeholder. Fixed dimensions avoid the old full-width hero breaking on
  // very tall or very wide provider photos.
  const heroImage = baseRecipeInfo?.image && String(baseRecipeInfo.image).trim() !== ""
    ? String(baseRecipeInfo.image) : null;
  const sourceLabel = isThemealdb ? "Recipe via TheMealDB"
    : (savedRecipeId || isCreating === "true") ? null : "Recipe via FatSecret";

  // Photo upload is only for the user's OWN custom recipes — never for FatSecret/TheMealDB
  // recipes (read-only sources) or saved copies of them. Custom recipes carry an
  // externalId beginning with "custom-"; sourced recipes carry their provider's ID.
  const isCustomRecipe =
    isCreating === "true" ||
    String(baseRecipeInfo?.externalId || "").startsWith("custom-");

  // Display "6.0g" like the Food detail card so read-only and editable states match.
  const formatMacroDisplay = (value: string) => `${(Number(value) || 0).toFixed(1)}g`;

  // One tap-to-edit Fat/Protein/Carbs cell (clean Text until its pencil is tapped).
  const renderMacroCell = (
    label: string,
    value: string,
    onChange: (t: string) => void,
    normalize: () => void,
    editing: boolean,
    setEditing: (v: boolean) => void,
    withLeftBorder: boolean,
  ) => (
    <View className={`flex-1 items-center ${withLeftBorder ? 'border-l border-gray-100' : ''}`}>
      <Text className="text-gray-400 mb-1">{label}</Text>
      {editing ? (
        <TextInput
          autoFocus
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
          onBlur={() => { normalize(); setEditing(false); }}
          onSubmitEditing={() => { normalize(); setEditing(false); }}
          keyboardType="numeric"
          returnKeyType="done"
          className="font-bold text-lg text-gray-900 text-center"
          style={{ minWidth: 44, padding: 0 }}
          placeholder="0"
          placeholderTextColor="#9CA3AF"
        />
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)} className="flex-row items-center">
          <Text className="font-bold text-lg text-gray-900">{formatMacroDisplay(value)}</Text>
          <Ionicons name="create-outline" size={12} color="#007BFF" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
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
         {/* TITLE + PILLS + COMPACT IMAGE — mirrors the Food detail (comboDetail) header */}
         <View className="flex-row items-start mb-6" style={{ gap: 16 }}>
            <View className="flex-1" style={{ gap: 14, paddingTop: 2, minWidth: 0 }}>
               {/* TITLE — editable only for custom recipes; read-only for TheMealDB / FatSecret */}
               {isCustomRecipe ? (
                  <TextInput
                     value={recipeTitle}
                     onChangeText={setRecipeTitle}
                     className="text-2xl font-extrabold text-gray-900 border-b border-gray-200 pb-2"
                     style={{ letterSpacing: -0.4 }}
                     multiline
                     placeholder="Name your recipe..."
                     placeholderTextColor="#9CA3AF"
                  />
               ) : (
                  <Text className="text-2xl font-extrabold text-gray-900 border-b border-gray-200 pb-2" style={{ letterSpacing: -0.4 }}>
                     {recipeTitle}
                  </Text>
               )}

               <View style={{ gap: 9 }}>
                  {/* CALORIE PILL — clean Text until the pencil flips it to an input */}
                  <View className="flex-row items-center self-start bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm">
                     <Ionicons name="flame" size={19} color="#FF9500" />
                     {editingCalories ? (
                        <TextInput
                           autoFocus
                           value={recipeCalories}
                           onChangeText={(text) => setRecipeCalories(text.replace(/[^0-9.]/g, ""))}
                           onBlur={() => { setRecipeCalories(normalizeCaloriesInput(recipeCalories)); setEditingCalories(false); }}
                           onSubmitEditing={() => { setRecipeCalories(normalizeCaloriesInput(recipeCalories)); setEditingCalories(false); }}
                           keyboardType="numeric"
                           returnKeyType="done"
                           className="font-bold ml-2 text-base text-gray-900"
                           style={{ minWidth: 56, padding: 0 }}
                           placeholder="0"
                           placeholderTextColor="#9CA3AF"
                        />
                     ) : (
                        <Text className="font-bold ml-2 text-base text-gray-900">{recipeCalories} kcal</Text>
                     )}
                     <TouchableOpacity onPress={() => setEditingCalories(true)} className="ml-2 w-6 h-6 rounded-full bg-blue-50 items-center justify-center">
                        <Ionicons name="create-outline" size={13} color="#007BFF" />
                     </TouchableOpacity>
                  </View>

                  {/* SERVING PILL — free text, e.g. "10 servings" or "Whole recipe" */}
                  <View className="flex-row items-center self-start bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm">
                     <Ionicons name="restaurant-outline" size={17} color="#6B7280" />
                     {editingServing ? (
                        <TextInput
                           autoFocus
                           value={servingText}
                           onChangeText={setServingText}
                           onBlur={() => setEditingServing(false)}
                           onSubmitEditing={() => setEditingServing(false)}
                           returnKeyType="done"
                           className="font-bold ml-2 text-sm text-gray-900"
                           style={{ minWidth: 90, padding: 0 }}
                           placeholder="Servings…"
                           placeholderTextColor="#9CA3AF"
                        />
                     ) : (
                        <Text className={`font-bold ml-2 text-sm ${servingText ? 'text-gray-900' : 'text-gray-400'}`}>
                           {servingText || 'Servings…'}
                        </Text>
                     )}
                     <TouchableOpacity onPress={() => setEditingServing(true)} className="ml-2 w-6 h-6 rounded-full bg-blue-50 items-center justify-center">
                        <Ionicons name="create-outline" size={13} color="#007BFF" />
                     </TouchableOpacity>
                  </View>
               </View>
            </View>

            {/* COMPACT IMAGE (matches comboDetail 138x172) */}
            <View className="rounded-3xl overflow-hidden items-center justify-center" style={{ width: 138, height: 172 }}>
               {(heroImage && !heroFailed) ? (
                  <View style={{ width: 138, height: 172 }}>
                     <Image
                        source={{ uri: heroImage }}
                        className="w-full h-full"
                        resizeMode="cover"
                        onError={() => setHeroFailed(true)}
                     />
                     {isCustomRecipe ? (
                        <TouchableOpacity
                           onPress={handleChangePhoto}
                           disabled={uploadingImage}
                           className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/60 items-center justify-center"
                        >
                           {uploadingImage ? (
                              <ActivityIndicator size="small" color="#fff" />
                           ) : (
                              <Ionicons name="camera" size={16} color="#fff" />
                           )}
                        </TouchableOpacity>
                     ) : null}
                  </View>
               ) : isCustomRecipe ? (
                  <TouchableOpacity
                     onPress={handleChangePhoto}
                     disabled={uploadingImage}
                     className="items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded-3xl"
                     style={{ width: 138, height: 172 }}
                  >
                     {uploadingImage ? (
                        <ActivityIndicator size="small" color="#007BFF" />
                     ) : (
                        <>
                           <Ionicons name="camera-outline" size={24} color="#9CA3AF" />
                           <Text className="text-gray-400 font-semibold text-xs mt-1.5 text-center px-2">Add a photo</Text>
                        </>
                     )}
                  </TouchableOpacity>
               ) : (
                  <View className="items-center justify-center bg-gray-100 w-full h-full">
                     <Ionicons name="restaurant-outline" size={28} color="#9CA3AF" />
                  </View>
               )}
            </View>
         </View>

         {/* NUTRITION SOURCE NOTE — honest about where the numbers come from */}
         {isThemealdb ? (
            <View className="flex-row items-start mb-4">
               <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" style={{ marginTop: 2 }} />
               <Text className="text-gray-400 text-xs ml-1.5 flex-1 leading-5">
                  {mealdbNutrition
                     ? `Estimated from ingredients (USDA)${mealdbNutrition.lowConfidence ? ' · rough estimate' : ''} - edit values before logging a portion.`
                     : 'Nutrition estimate coming soon — edit the values to log it now.'}
               </Text>
            </View>
         ) : sourceLabel === "Recipe via FatSecret" ? (
            <View className="flex-row items-start mb-4">
               <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" style={{ marginTop: 2 }} />
               <Text className="text-gray-400 text-xs ml-1.5 flex-1 leading-5">Nutrition via FatSecret · per serving.</Text>
            </View>
         ) : null}

         {/* NUTRITION CARD (editable Fat / Protein / Carbs) */}
         {isCustomRecipe && (
            <View className="flex-row justify-between items-center mb-2.5">
               <Text className="text-lg font-bold text-gray-900">Nutrition</Text>
               <Text className="text-xs text-gray-400">optional · per whole recipe</Text>
            </View>
         )}
         <View className="bg-white border border-gray-200 rounded-2xl p-4 flex-row justify-around shadow-sm mb-6">
            {renderMacroCell('Fat', recipeFats, setRecipeFats, () => setRecipeFats(normalizeMacroInput(recipeFats)), editingFat, setEditingFat, false)}
            {renderMacroCell('Protein', recipeProtein, setRecipeProtein, () => setRecipeProtein(normalizeMacroInput(recipeProtein)), editingProtein, setEditingProtein, true)}
            {renderMacroCell('Carbs', recipeCarbs, setRecipeCarbs, () => setRecipeCarbs(normalizeMacroInput(recipeCarbs)), editingCarbs, setEditingCarbs, true)}
         </View>

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
