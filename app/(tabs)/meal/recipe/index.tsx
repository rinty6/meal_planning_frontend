// This file displays the recipe page with all functions
// Collect recipe details from the Fatsercet and then shows to users
// They can explore the recipe that they want to cook or eat

import { View, Text, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Image, Modal } from 'react-native';
import React, { useState, useEffect, useMemo } from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchRecipes } from '../../../../services/mealAPI';
import Food3DIcon from '../../../../components/Food3DIcon';

type FilterRange = {
  id: string;
  label: string;
  min?: number;
  max?: number;
};

const CALORIE_RANGES: FilterRange[] = [
  { id: 'low', label: 'Low Calorie', min: 0, max: 300 },
  { id: 'medium', label: 'Medium Calorie', min: 300, max: 600 },
  { id: 'high', label: 'High Calorie', min: 600, max: Infinity },
];

const PROTEIN_RANGES: FilterRange[] = [
  { id: 'high_protein', label: 'High Protein (>20g)', min: 20 },
  { id: 'medium_protein', label: 'Medium Protein (10-20g)', min: 10, max: 20 },
  { id: 'low_protein', label: 'Low Protein (<10g)', max: 10 },
];

const CALORIE_FILTER_IDS = new Set(CALORIE_RANGES.map((range) => range.id));
const PROTEIN_FILTER_IDS = new Set(PROTEIN_RANGES.map((range) => range.id));

const getFilterGroup = (filterId: string): 'calorie' | 'protein' | null => {
  if (CALORIE_FILTER_IDS.has(filterId)) return 'calorie';
  if (PROTEIN_FILTER_IDS.has(filterId)) return 'protein';
  return null;
};

const isWithinRange = (value: number, range: FilterRange | null) => {
  if (!range) return true;
  if (typeof range.min === 'number' && value < range.min) return false;
  if (typeof range.max === 'number' && value > range.max) return false;
  return true;
};

const RecipeScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // SORT STATE
  const [isSortVisible, setIsSortVisible] = useState(false);
  const [sortOption, setSortOption] = useState<'default' | 'calories_low' | 'calories_high'>('default');

  // FILTER STATE
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const activeFilterSet = useMemo(() => new Set(activeFilters), [activeFilters]);

  useEffect(() => {
    handleSearch();
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    const results = await searchRecipes(searchQuery);
    setRecipes(results);
    setLoading(false);
  };

  const selectedCalorieRange = useMemo(
    () => CALORIE_RANGES.find((range) => activeFilterSet.has(range.id)) ?? null,
    [activeFilterSet]
  );

  const selectedProteinRange = useMemo(
    () => PROTEIN_RANGES.find((range) => activeFilterSet.has(range.id)) ?? null,
    [activeFilterSet]
  );

  // FILTER LOGIC
  const filteredRecipes = useMemo(() => {
    if (!selectedCalorieRange && !selectedProteinRange) return recipes;

    return recipes.filter((recipe) => {
      const calories = Number(recipe?.calories) || 0;
      const protein = Number(recipe?.protein) || 0;
      return isWithinRange(calories, selectedCalorieRange) && isWithinRange(protein, selectedProteinRange);
    });
  }, [recipes, selectedCalorieRange, selectedProteinRange]);

  // SORTING LOGIC
  const sortedRecipes = useMemo(() => {
    const list = [...filteredRecipes];
    if (sortOption === 'calories_low') {
      return list.sort((a, b) => a.calories - b.calories);
    } else if (sortOption === 'calories_high') {
      return list.sort((a, b) => b.calories - a.calories);
    }
    return list; // Default (Relevance)
  }, [filteredRecipes, sortOption]);

  const toggleFilter = (filterId: string) => {
    setActiveFilters((prev) => {
      if (prev.includes(filterId)) {
        return prev.filter((id) => id !== filterId);
      }

      const selectedGroup = getFilterGroup(filterId);
      if (!selectedGroup) return prev;

      const next = prev.filter((id) => getFilterGroup(id) !== selectedGroup);
      return [...next, filterId];
    });
  };

  const renderFilterOption = (option: any) => (
    <TouchableOpacity
      key={option.id}
      onPress={() => toggleFilter(option.id)}
      className={`p-3 border-b border-gray-100 flex-row items-center justify-between`}
    >
      <Text className="text-lg text-gray-800">{option.label}</Text>
      <View
        className={`w-6 h-6 rounded border-2 items-center justify-center ${
          activeFilterSet.has(option.id) ? 'bg-primary border-primary' : 'border-gray-300'
        }`}
      >
        {activeFilterSet.has(option.id) && <Ionicons name="checkmark" size={16} color="white" />}
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      className="flex-1 m-2 bg-blue-50 rounded-3xl p-3 shadow-sm border border-blue-100"
      onPress={() => router.push({
        pathname: "/(tabs)/meal/recipedetail", 
        params: { 
          id: item.id,
          previewImage: item.image,
         } 
      })}
    >
      <View className="w-full h-32 bg-white rounded-2xl mb-3 overflow-hidden items-center justify-center">
         {item.image && item.image !== "" ? (
            <Image source={{ uri: item.image }} className="w-full h-full" resizeMode="cover" />
         ) : (
            <Food3DIcon name={item.title} size={80} />
         )}
      </View>
      <Text className="font-bold text-base text-gray-900 mb-1" numberOfLines={1}>{item.title}</Text>
      <Text className="font-bold text-black">{item.calories} kcal</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER */}
      <View className="px-5 py-2 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.push('/(tabs)/meal')}>
          <Ionicons name="chevron-back" size={28} color="black" />
        </TouchableOpacity>
        <View className="flex-1 flex-row items-center bg-gray-100 rounded-2xl px-4 py-3">
            <Ionicons name="search" size={20} color="gray" />
            <TextInput 
                className="flex-1 ml-2 text-base"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                placeholder="Search recipes..."
            />
        </View>
        <TouchableOpacity 
            onPress={() => router.push({
                pathname: "/(tabs)/meal/recipedetail",
                params: { isCreating: "true" } 
            })}
        >
            <Ionicons name="add-circle" size={32} color="#007BFF" />
        </TouchableOpacity>
      </View>

      {/* FILTERS ROW */}
      <View className="px-5 py-4 flex-row gap-3">
         {/* Sort Button */}
         <TouchableOpacity 
            onPress={() => setIsSortVisible(true)}
            className="border border-gray-200 rounded-xl px-4 py-2 flex-row items-center"
         >
             <Text className="text-gray-600 mr-2">
                {sortOption === 'default' ? 'Sort' : sortOption === 'calories_low' ? 'Low Cal' : 'High Cal'}
             </Text>
             <Ionicons name="chevron-down" size={12} color="gray" />
         </TouchableOpacity>

         {/* Filter Button */}
         <TouchableOpacity
            onPress={() => setIsFilterVisible(true)}
            className="border border-gray-200 rounded-xl px-4 py-2 flex-row items-center bg-white shadow-sm"
         >
             <Ionicons name="filter" size={16} color="black" />
             <Text className="text-black ml-2">Filter</Text>
             {activeFilters.length > 0 && (
               <View className="ml-2 bg-primary w-5 h-5 rounded-full items-center justify-center">
                   <Text className="text-white text-xs font-bold">{activeFilters.length}</Text>
               </View>
             )}
         </TouchableOpacity>

         <TouchableOpacity className="ml-auto justify-center" onPress={() => router.push('/(tabs)/meal/favorites')}>
             <Text className="text-primary font-bold">To My Favorites {'>'}</Text>
         </TouchableOpacity>
      </View>

      {/* RECIPE GRID */}
      {loading ? (
        <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
      ) : (
        <FlatList 
          data={sortedRecipes} // Use the sorted list
          numColumns={2}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 15 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* SORT MODAL */}
      <Modal transparent visible={isSortVisible} animationType="fade" onRequestClose={() => setIsSortVisible(false)}>
         <TouchableOpacity className="flex-1 bg-black/50 justify-center items-center" onPress={() => setIsSortVisible(false)}>
            <View className="bg-white w-3/4 rounded-2xl p-5">
                <Text className="text-lg font-bold mb-4 text-center">Sort By</Text>
                
                <TouchableOpacity onPress={() => {setSortOption('default'); setIsSortVisible(false)}} className="p-3 border-b border-gray-100">
                    <Text className="text-center text-lg">Relevance (Default)</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {setSortOption('calories_low'); setIsSortVisible(false)}} className="p-3 border-b border-gray-100">
                    <Text className="text-center text-lg">Calories (Low to High)</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {setSortOption('calories_high'); setIsSortVisible(false)}} className="p-3">
                    <Text className="text-center text-lg">Calories (High to Low)</Text>
                </TouchableOpacity>
            </View>
         </TouchableOpacity>
      </Modal>

      {/* FILTER MODAL */}
      <Modal transparent visible={isFilterVisible} animationType="slide" onRequestClose={() => setIsFilterVisible(false)}>
         <View className="flex-1 bg-white" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
            {/* HEADER */}
            <View className="flex-row items-center px-5 py-3 border-b border-gray-200">
               <TouchableOpacity 
                  onPress={() => setIsFilterVisible(false)}
                  className="flex-row items-center justify-center p-2"
               >
                  <Ionicons name="chevron-back" size={28} color="black" />
               </TouchableOpacity>
               <Text className="text-lg font-bold flex-1 text-center mr-12">Filters</Text>
            </View>

            {/* FILTER SECTIONS */}
            <FlatList
               data={[
                  { section: 'Calories', items: CALORIE_RANGES },
                  { section: 'Protein', items: PROTEIN_RANGES },
               ]}
               keyExtractor={(item: any) => item.section}
               renderItem={({ item: { section, items } }: any) => (
                  <View>
                     <Text className="text-base font-bold text-gray-700 px-5 py-4 bg-gray-50">{section}</Text>
                     {items.map((option: any) => renderFilterOption(option))}
                  </View>
               )}
               scrollEnabled={true}
               contentContainerStyle={{ flexGrow: 1 }}
            />

            {/* FOOTER BUTTONS */}
            <View className="px-5 py-4 flex-row gap-3 border-t border-gray-200 bg-white">
               <TouchableOpacity
                  onPress={() => {
                     setActiveFilters([]);
                  }}
                  className="flex-1 border border-gray-300 rounded-lg p-4 items-center"
               >
                  <Text className="text-gray-700 font-bold text-base">Clear All</Text>
               </TouchableOpacity>
               <TouchableOpacity
                  onPress={() => setIsFilterVisible(false)}
                  className="flex-1 bg-primary rounded-lg p-4 items-center"
               >
                  <Text className="text-white font-bold text-base">Apply</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>

    </SafeAreaView>
  );
};

export default RecipeScreen;
