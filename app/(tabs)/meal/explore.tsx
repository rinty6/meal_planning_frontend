// Explore by Cuisine — the visual browse experience powered by TheMealDB.
// Kept as a SEPARATE screen from the FatSecret recipe search on purpose:
// the two sources have non-overlapping capabilities and CANNOT be intersected
// server-side (see Errors 055-058). This screen is a single screen with NO
// nested Modals; the search input is always anchored at the TOP so the keyboard
// never covers it; lists are de-duped before use as React keys.

import { View, Text, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Image } from 'react-native';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Food3DIcon from '../../../components/Food3DIcon';
import InfoButton from '../../../components/InforButton';
import NutritionMethodModal from '../../../components/NutritionMethodModal';
import { getCuisines, getDishesByCuisine, type CuisineArea, type CuisineDish } from '../../../services/themealdbAPI';

// Demonym -> flag emoji for the cuisines TheMealDB exposes. Falls back to a globe.
const CUISINE_FLAGS: Record<string, string> = {
  Algerian: '🇩🇿', American: '🇺🇸', Australian: '🇦🇺', British: '🇬🇧', Canadian: '🇨🇦',
  Chinese: '🇨🇳', Croatian: '🇭🇷', Dutch: '🇳🇱', Egyptian: '🇪🇬', Filipino: '🇵🇭',
  French: '🇫🇷', Greek: '🇬🇷', Indian: '🇮🇳', Irish: '🇮🇪', Italian: '🇮🇹',
  Jamaican: '🇯🇲', Japanese: '🇯🇵', Kenyan: '🇰🇪', Malaysian: '🇲🇾', Mexican: '🇲🇽',
  Moroccan: '🇲🇦', Polish: '🇵🇱', Portuguese: '🇵🇹', Russian: '🇷🇺', 'Saudi Arabian': '🇸🇦',
  Spanish: '🇪🇸', Syrian: '🇸🇾', Thai: '🇹🇭', Tunisian: '🇹🇳', Turkish: '🇹🇷',
  Ukrainian: '🇺🇦', Uruguayan: '🇺🇾', Vietnamese: '🇻🇳', Slovakian: '🇸🇰',
};
const flagFor = (cuisine: string) => CUISINE_FLAGS[cuisine] || '🌍';

const ExploreCuisineScreen = () => {
  const router = useRouter();

  // Cuisine list state
  const [cuisines, setCuisines] = useState<CuisineArea[]>([]);
  const [cuisinesLoading, setCuisinesLoading] = useState(false);
  const [cuisinesError, setCuisinesError] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState('');

  // Selected-cuisine / dishes state
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [dishes, setDishes] = useState<CuisineDish[]>([]);
  const [dishesLoading, setDishesLoading] = useState(false);
  const [dishesError, setDishesError] = useState('');
  const [dishFilter, setDishFilter] = useState('');

  // "How calories are estimated" explainer
  const [showMethod, setShowMethod] = useState(false);

  const loadCuisines = useCallback(async () => {
    setCuisinesLoading(true);
    setCuisinesError('');
    try {
      const list = await getCuisines();
      // Defensive de-dupe by area name (the backend already de-dupes, but never
      // trust a third-party list as a React key — Error 057).
      const seen = new Set<string>();
      const unique = list.filter((c) => (seen.has(c.area) ? false : (seen.add(c.area), true)));
      unique.sort((a, b) => a.area.localeCompare(b.area));
      setCuisines(unique);
    } catch (error) {
      console.error('Failed to load cuisines:', error);
      setCuisinesError('We could not load cuisines right now. Please try again.');
    } finally {
      setCuisinesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCuisines();
  }, [loadCuisines]);

  const selectCuisine = useCallback(async (cuisine: string) => {
    setSelectedCuisine(cuisine);
    setDishFilter('');
    setDishes([]);
    setDishesLoading(true);
    setDishesError('');
    try {
      const result = await getDishesByCuisine(cuisine);
      setDishes(result);
    } catch (error) {
      console.error(`Failed to load ${cuisine} dishes:`, error);
      setDishesError(`We could not load ${cuisine} dishes right now. Please try again.`);
    } finally {
      setDishesLoading(false);
    }
  }, []);

  const clearCuisine = useCallback(() => {
    setSelectedCuisine(null);
    setDishes([]);
    setDishesError('');
    setDishFilter('');
  }, []);

  const filteredCuisines = useMemo(() => {
    const q = cuisineFilter.trim().toLowerCase();
    if (!q) return cuisines;
    return cuisines.filter((c) => c.area.toLowerCase().includes(q));
  }, [cuisines, cuisineFilter]);

  // Within a cuisine, the search box is a pure client-side filter on that
  // cuisine's dish names — explicitly scoped so the two sources never silently
  // fight each other (Error 058).
  const filteredDishes = useMemo(() => {
    const q = dishFilter.trim().toLowerCase();
    if (!q) return dishes;
    return dishes.filter((d) => d.title.toLowerCase().includes(q));
  }, [dishes, dishFilter]);

  const renderCuisine = ({ item }: { item: CuisineArea }) => (
    <TouchableOpacity
      className="flex-1 m-2 bg-blue-50 rounded-3xl p-4 shadow-sm border border-blue-100 items-center"
      onPress={() => selectCuisine(item.area)}
    >
      <Text className="text-4xl mb-2">{flagFor(item.area)}</Text>
      <Text className="font-bold text-base text-gray-900" numberOfLines={1}>{item.area}</Text>
      {item.count > 0 && (
        <Text className="text-gray-400 text-xs mt-0.5">{item.count} {item.count === 1 ? 'recipe' : 'recipes'}</Text>
      )}
    </TouchableOpacity>
  );

  const renderDish = ({ item }: { item: CuisineDish }) => (
    <TouchableOpacity
      className="flex-1 m-2 bg-blue-50 rounded-3xl p-3 shadow-sm border border-blue-100"
      onPress={() => router.push({
        pathname: '/(tabs)/meal/recipedetail',
        params: { id: item.id, previewImage: item.image, source: 'themealdb' },
      })}
    >
      <View className="w-full h-32 bg-white rounded-2xl mb-3 overflow-hidden items-center justify-center">
        {item.image && item.image !== '' ? (
          <Image source={{ uri: item.image }} className="w-full h-full" resizeMode="cover" />
        ) : (
          <Food3DIcon name={item.title} size={80} />
        )}
      </View>
      <Text className="font-bold text-base text-gray-900" numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );

  const renderEmpty = (message: string) => (
    <View className="items-center justify-center mt-16 px-8">
      <Ionicons name="restaurant-outline" size={48} color="#CBD5E1" />
      <Text className="text-gray-400 text-center mt-3">{message}</Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER (always anchored at top; search sits below it, above the list) */}
      <View className="px-5 py-2 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="black" />
        </TouchableOpacity>
        <Text className="text-lg font-bold">
          {selectedCuisine ? selectedCuisine : 'Explore by Cuisine'}
        </Text>
        <InfoButton onPress={() => setShowMethod(true)} />
      </View>

      {!selectedCuisine ? (
        <>
          {/* CUISINE SEARCH (top-anchored) */}
          <View className="px-5 py-2">
            <View className="flex-row items-center bg-gray-100 rounded-2xl px-4 py-3">
              <Ionicons name="search" size={20} color="gray" />
              <TextInput
                className="flex-1 ml-2 text-base text-black"
                value={cuisineFilter}
                onChangeText={setCuisineFilter}
                placeholder="Search cuisines..."
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {cuisinesLoading ? (
            <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
          ) : cuisinesError ? (
            <View className="items-center mt-12 px-8">
              <Text className="text-gray-500 text-center mb-4">{cuisinesError}</Text>
              <TouchableOpacity onPress={loadCuisines} className="bg-primary px-5 py-2 rounded-xl">
                <Text className="text-white font-bold">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredCuisines}
              numColumns={2}
              keyExtractor={(item) => item.area}
              renderItem={renderCuisine}
              ListEmptyComponent={renderEmpty('No cuisines match your search.')}
              contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 24, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      ) : (
        <>
          {/* ACTIVE-CUISINE CHIP + back-to-all */}
          <View className="px-5 pt-1 pb-2">
            <TouchableOpacity
              onPress={clearCuisine}
              className="self-start flex-row items-center bg-blue-100 rounded-full px-3 py-1.5"
            >
              <Text className="text-base mr-1">{flagFor(selectedCuisine)}</Text>
              <Text className="text-primary font-bold mr-1">{selectedCuisine}</Text>
              <Ionicons name="close-circle" size={16} color="#007BFF" />
            </TouchableOpacity>
          </View>

          {/* DISH SEARCH within this cuisine (top-anchored) */}
          <View className="px-5 pb-2">
            <View className="flex-row items-center bg-gray-100 rounded-2xl px-4 py-3">
              <Ionicons name="search" size={20} color="gray" />
              <TextInput
                className="flex-1 ml-2 text-base text-black"
                value={dishFilter}
                onChangeText={setDishFilter}
                placeholder={`Search ${selectedCuisine} dish names...`}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {dishesLoading ? (
            <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
          ) : dishesError ? (
            <View className="items-center mt-12 px-8">
              <Text className="text-gray-500 text-center mb-4">{dishesError}</Text>
              <TouchableOpacity onPress={() => selectCuisine(selectedCuisine)} className="bg-primary px-5 py-2 rounded-xl">
                <Text className="text-white font-bold">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredDishes}
              numColumns={2}
              keyExtractor={(item) => item.id}
              renderItem={renderDish}
              ListEmptyComponent={renderEmpty(
                dishFilter
                  ? 'No dish names match your search. (Searching by ingredient is coming soon.)'
                  : 'No dishes found for this cuisine.'
              )}
              contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 24, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      <NutritionMethodModal visible={showMethod} onClose={() => setShowMethod(false)} />
    </SafeAreaView>
  );
};

export default ExploreCuisineScreen;
