/**
 * ADD FOOD MODAL COMPONENT
 *
 * Four view modes rendered inside a single Modal — no nested modals, no overlays:
 *   'search'      — search bar + results + 3 action buttons
 *   'manual'      — image, name, macros, save button
 *   'barcode'     — full-screen camera scanner (own nested Modal, unchanged)
 *   'recognition' — food recognition result view
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { searchFoodItems, getFoodById } from '../services/mealAPI';
import { fetchBarcodeData } from '../services/barcodeAPI';
import { recognizeFood } from '../services/foodRecognitionAPI';
import type { PredictionResult, FoodCandidate } from '../services/foodRecognitionAPI';
// CustomAlert was used previously, but it relies on a top-level Modal that
// stacks unreliably on top of AddFoodModal on iOS. The alert is now rendered
// as an in-modal overlay View near the bottom of this file.
import FoodRecognitionResultModal from './FoodRecognitionResultModal';

interface AddFoodModalProps {
  visible: boolean;
  onClose: () => void;
  mealType: string;
  onAddFood: (foodItem: any) => void;
}

const AddFoodModal = ({ visible, onClose, mealType, onAddFood }: AddFoodModalProps) => {
  const { getToken, userId } = useAuth();
  const [viewMode, setViewMode] = useState<'search' | 'manual' | 'barcode' | 'recognition'>('search');

  // --- CUSTOM ALERT ---
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const showCustomAlert = (title: string, message: string) => {
    setAlertConfig({ title, message });
    setAlertVisible(true);
  };

  // --- SEARCH ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const latestSearchRequestRef = useRef(0);

  // --- MANUAL ENTRY ---
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualImage, setManualImage] = useState<string | null>(null);

  // --- BARCODE ---
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [processingBarcode, setProcessingBarcode] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const isProcessingRef = useRef(false);

  // --- FOOD RECOGNITION ---
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<PredictionResult | null>(null);
  const [recognitionImageUri, setRecognitionImageUri] = useState<string | null>(null);

  // Barcode processing step animation
  useEffect(() => {
    if (!processingBarcode) { setProcessingStep(0); return; }
    const t1 = setTimeout(() => setProcessingStep(1), 800);
    const t2 = setTimeout(() => setProcessingStep(2), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [processingBarcode]);

  useEffect(() => {
    if (barcodeScanning && !cameraPermission?.granted) requestCameraPermissionHandler();
  }, [barcodeScanning]);

  const requestCameraPermissionHandler = async () => {
    const permission = await requestCameraPermission();
    if (!permission?.granted) {
      showCustomAlert('Camera Access Required', 'Enable camera permissions in your settings to scan barcodes.');
      setBarcodeScanning(false);
    }
  };

  // --- BARCODE SCAN ---
  // The result alert is now an in-modal overlay (see the JSX near the bottom of
  // this file), so it no longer races with the scanner Modal's dismiss animation.
  // The 450 ms delay is kept as a deliberate visual pause: scanner slides away,
  // the modal content is briefly visible, then the result is announced. Without
  // any pause the transition feels too abrupt.
  const SCANNER_DISMISS_MS = 450;

  // After the FatSecret OAuth + apiCache warmup landed, fetchBarcodeData now
  // returns in 200–400 ms when the cache is warm. Without a floor, the "Looking
  // up product…" view flashes by faster than the user can read it, the scanner
  // dismisses, the alert pops up, and the user reflexively taps it away before
  // registering the message. Holding the processing view for at least 1.5 s
  // guarantees the user sees what is happening before the result is announced
  // and also gives the progressive status lines (at 800 ms / 1600 ms) a chance
  // to render. The user perceives the flow as deliberate instead of frantic.
  const MIN_PROCESSING_DISPLAY_MS = 1500;

  const closeScannerThenAlert = (title: string, message: string) => {
    isProcessingRef.current = false;
    setProcessingBarcode(false);
    setBarcodeScanning(false);
    // Brief pause after dismissing the scanner so the user perceives a
    // deliberate scanner-→-result transition, not an abrupt flash.
    setTimeout(() => showCustomAlert(title, message), SCANNER_DISMISS_MS);
  };

  const waitForMinProcessingDisplay = async (startedAt: number) => {
    const remainingMs = MIN_PROCESSING_DISPLAY_MS - (Date.now() - startedAt);
    if (remainingMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
    }
  };

  const handleBarcodeScan = async (data: any) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setProcessingBarcode(true);
    const processingStartedAt = Date.now();
    const scannedBarcode = String(data?.data || '').trim();

    try {
      const response = await fetchBarcodeData(scannedBarcode);
      await waitForMinProcessingDisplay(processingStartedAt);

      if (!response.success || !response.data) {
        closeScannerThenAlert(
          'Product Not Found',
          `We couldn't find this barcode in Open Food Facts.\n\nBarcode: ${scannedBarcode || 'Unknown'}\n\nTry scanning again or add the item manually.`
        );
        return;
      }

      const { foodName, calories, protein, carbs, fats, image } = response.data;
      setManualName(foodName);
      setManualCalories(calories.toString());
      setManualProtein(protein.toString());
      setManualCarbs(carbs.toString());
      setManualFat(fats.toString());
      if (image) setManualImage(image);

      setBarcodeScanning(false);
      isProcessingRef.current = false;
      setProcessingBarcode(false);
      setViewMode('manual');
    } catch {
      await waitForMinProcessingDisplay(processingStartedAt);
      closeScannerThenAlert(
        'Scan Failed',
        'We could not process this barcode. Please try scanning again or add the item manually.'
      );
    }
  };

  // --- FOOD RECOGNITION ---
  const processImageForRecognition = async (uri: string) => {
    setRecognitionImageUri(uri);
    setRecognitionLoading(true);
    try {
      const prediction = await recognizeFood(uri, { getToken, clerkId: userId });
      setRecognitionResult(prediction);
      setViewMode('recognition');
    } catch {
      showCustomAlert('Recognition Failed',
        'Could not analyse the image. Check your connection and try again with a clearer, well-lit photo.');
    } finally {
      setRecognitionLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showCustomAlert('Camera Access Required', 'Enable camera permissions to scan food.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    await processImageForRecognition(result.assets[0].uri);
  };

  const handlePickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showCustomAlert('Permission Required', 'Enable photo library access to upload a food image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    await processImageForRecognition(result.assets[0].uri);
  };

  const handleUseFoodFromRecognition = (candidate: FoodCandidate) => {
    const newFood = {
      title: candidate.display_name,
      calories: candidate.nutrition?.calories != null ? Math.round(candidate.nutrition.calories) : 0,
      protein: candidate.nutrition?.protein_g != null ? parseFloat(candidate.nutrition.protein_g.toFixed(1)) : 0,
      carbs: candidate.nutrition?.carbs_g != null ? parseFloat(candidate.nutrition.carbs_g.toFixed(1)) : 0,
      fats: candidate.nutrition?.fat_g != null ? parseFloat(candidate.nutrition.fat_g.toFixed(1)) : 0,
      image: recognitionImageUri || '',
      food_name: candidate.display_name,
      type: 'recognition',
    };
    clearRecognitionState();
    onAddFood(newFood);
  };

  const handleEditRecognitionDetails = (candidate: FoodCandidate) => {
    setManualName(candidate.display_name);
    if (candidate.nutrition) {
      setManualCalories(candidate.nutrition.calories != null ? Math.round(candidate.nutrition.calories).toString() : '');
      setManualProtein(candidate.nutrition.protein_g != null ? candidate.nutrition.protein_g.toFixed(1) : '');
      setManualCarbs(candidate.nutrition.carbs_g != null ? candidate.nutrition.carbs_g.toFixed(1) : '');
      setManualFat(candidate.nutrition.fat_g != null ? candidate.nutrition.fat_g.toFixed(1) : '');
    }
    if (recognitionImageUri) setManualImage(recognitionImageUri);
    clearRecognitionState();
    setViewMode('manual');
  };

  const handleRecognitionTryAgain = () => {
    clearRecognitionState();
    setViewMode('search');
    setTimeout(() => handleTakePhoto(), 400);
  };

  const clearRecognitionState = () => {
    setRecognitionResult(null);
    setRecognitionImageUri(null);
  };

  // --- SEARCH ---
  const handleSearch = async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;
    setLoading(true);
    setHasCompletedSearch(false);
    try {
      const items = await searchFoodItems(trimmedQuery);
      if (latestSearchRequestRef.current !== requestId) return;
      setResults(items);
    } catch {
      if (latestSearchRequestRef.current !== requestId) return;
      setResults([]);
    } finally {
      if (latestSearchRequestRef.current === requestId) {
        setLoading(false);
        setHasCompletedSearch(true);
      }
    }
  };

  const handleSearchTextChange = (text: string) => {
    latestSearchRequestRef.current += 1;
    setQuery(text);
    setResults([]);
    setLoading(false);
    setHasCompletedSearch(false);
  };

  const handleAddClick = async (id: string) => {
    setAddingId(id);
    try {
      const detailedFood = await getFoodById(id);
      if (detailedFood) onAddFood(detailedFood);
    } catch (error) {
      console.error('Error adding food:', error);
    } finally {
      setAddingId(null);
    }
  };

  // --- MANUAL FORM ---
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showCustomAlert('Permission Required', 'Allow access to photos to upload an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets?.length)
      setManualImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const handleSaveManual = () => {
    if (!manualName || !manualCalories) {
      showCustomAlert('Missing Fields', 'Please enter at least a Food Name and Calories.');
      return;
    }
    onAddFood({
      title: manualName,
      calories: parseFloat(manualCalories) || 0,
      protein: parseFloat(manualProtein) || 0,
      carbs: parseFloat(manualCarbs) || 0,
      fats: parseFloat(manualFat) || 0,
      image: manualImage || '',
      food_name: manualName,
      type: 'manual',
    });
    resetManualForm();
  };

  const resetManualForm = () => {
    setManualName(''); setManualCalories(''); setManualProtein('');
    setManualCarbs(''); setManualFat(''); setManualImage(null);
    setViewMode('search');
  };

  const resetSearchState = () => {
    setQuery(''); setResults([]); setLoading(false);
    setHasCompletedSearch(false); setAddingId(null);
    latestSearchRequestRef.current += 1;
  };

  const formatMacroValue = (value: any, unit = 'g') => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return `${parsed % 1 === 0 ? parsed.toFixed(0) : parsed.toFixed(1)}${unit}`;
  };

  // FatSecret returns a distinct serving basis per result (e.g. "1 medium (118g)",
  // "100 g"), which is what makes otherwise-identical foods differ. Surface it so
  // users can tell the results apart.
  const buildServingText = (item: any) => {
    const description = String(item?.serving_description || '').trim();
    if (description) return description;
    const amount = Number(item?.metric_serving_amount);
    const unit = String(item?.metric_serving_unit || '').trim();
    if (Number.isFinite(amount) && amount > 0) {
      const amountText = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(1);
      return `${amountText} ${unit || 'g'}`.trim();
    }
    return '1 serving';
  };

  const buildSearchResultMacroText = (item: any) => {
    const protein = formatMacroValue(item?.protein ?? 0);
    const fats = formatMacroValue(item?.fats ?? item?.fat ?? 0);
    const carbs = formatMacroValue(item?.carbs ?? item?.carbohydrate ?? 0);
    const macros = [
      protein ? `Protein ${protein}` : null,
      fats ? `Fat ${fats}` : null,
      carbs ? `Carbs ${carbs}` : null,
    ].filter(Boolean);

    return macros.length > 0 ? macros.join('  ') : String(item?.description || '').trim();
  };

  const handleClose = () => {
    resetManualForm();
    resetSearchState();
    clearRecognitionState();
    onClose();
  };

  const handleBackPress = () => {
    if (viewMode === 'recognition') {
      clearRecognitionState();
      setViewMode('search');
    } else {
      setViewMode('search');
    }
  };

  const headerTitle =
    viewMode === 'manual' ? 'Add Custom Food' :
    viewMode === 'recognition' ? 'Food Recognised' :
    `Add to ${mealType}`;

  return (
    <>
      <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={handleClose}>
        <View className="flex-1">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-black/50 justify-end"
        >
          <View className="h-[90%] bg-white rounded-t-3xl shadow-xl overflow-hidden">

            {/* HEADER */}
            <View className="px-5 pt-5 pb-2 flex-row justify-between items-center border-b border-gray-100">
              {(viewMode === 'manual' || viewMode === 'recognition') ? (
                <TouchableOpacity onPress={handleBackPress} className="p-2">
                  <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>
              ) : (
                <View className="w-8" />
              )}
              <Text className="text-xl font-bold text-black capitalize">{headerTitle}</Text>
              <TouchableOpacity onPress={handleClose} className="bg-gray-100 p-2 rounded-full">
                <Ionicons name="close" size={20} color="black" />
              </TouchableOpacity>
            </View>

            {/* CONTENT */}
            {viewMode === 'search' && (
              /* ── SEARCH VIEW ── */
              <View className="flex-1 p-5">
                <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3 mb-4">
                  <Ionicons name="search" size={20} color="gray" />
                  <TextInput
                    className="flex-1 ml-2 text-base text-black"
                    placeholder="Search (e.g., Chicken)"
                    placeholderTextColor="#9CA3AF"
                    value={query}
                    onChangeText={handleSearchTextChange}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={handleSearch}>
                      <Text className="text-primary font-bold">Search</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {loading ? (
                  <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
                ) : (
                  <FlatList
                    data={results}
                    keyExtractor={(item) => String(item.id)}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 210 }}
                    renderItem={({ item }) => (
                      <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center">
                        <View className="flex-1 mr-4">
                          <Text className="text-lg font-bold text-black">{item.title}</Text>
                          <View className="flex-row items-center mt-1">
                            <Ionicons name="restaurant-outline" size={13} color="#9CA3AF" />
                            <Text className="text-gray-400 text-xs ml-1" numberOfLines={1}>
                              Per {buildServingText(item)}
                            </Text>
                          </View>
                          <Text className="text-gray-500 text-xs mt-1" numberOfLines={2}>
                            {buildSearchResultMacroText(item)}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleAddClick(item.id)}
                          disabled={addingId === item.id}
                          className="bg-primary px-5 py-2 rounded-full"
                        >
                          {addingId === item.id
                            ? <ActivityIndicator size="small" color="white" />
                            : <Text className="text-white font-bold">Add</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                    ListEmptyComponent={
                      hasCompletedSearch && query.trim().length > 0
                        ? <Text className="text-center text-gray-400 mt-10">No foods found.</Text>
                        : null
                    }
                  />
                )}

                {/* Bottom action bar */}
                <View className="absolute bottom-0 left-0 right-0 bg-white px-5 pt-4 pb-10 border-t border-gray-100">
                  <TouchableOpacity
                    onPress={() => setViewMode('manual')}
                    className="bg-primary w-full py-4 rounded-xl items-center mb-3"
                  >
                    <Text className="text-white font-bold text-lg">+ Add Food Manually</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setBarcodeScanning(true)}
                    className="border-2 border-primary py-3 rounded-xl items-center flex-row justify-center mb-3"
                  >
                    <Ionicons name="barcode-outline" size={18} color="#007BFF" />
                    <Text className="text-primary font-bold ml-2">Scan Barcode</Text>
                  </TouchableOpacity>
                  <View className="flex-row">
                    <TouchableOpacity
                      onPress={handleTakePhoto}
                      className="flex-1 border-2 border-primary py-3 rounded-xl items-center flex-row justify-center mr-2"
                    >
                      <Ionicons name="camera-outline" size={18} color="#007BFF" />
                      <Text className="text-primary font-bold ml-2">Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handlePickFromLibrary}
                      className="flex-1 border-2 border-primary py-3 rounded-xl items-center flex-row justify-center"
                    >
                      <Ionicons name="images-outline" size={18} color="#007BFF" />
                      <Text className="text-primary font-bold ml-2">Upload Photo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {viewMode === 'manual' && (
              /* ── MANUAL VIEW ── */
              <ScrollView className="flex-1 px-6 pt-4" showsVerticalScrollIndicator={false}>
                <View className="items-center mb-6">
                  <TouchableOpacity
                    onPress={pickImage}
                    className="w-32 h-32 rounded-full border-2 border-dashed border-gray-300 items-center justify-center bg-gray-50 overflow-hidden"
                  >
                    {manualImage ? (
                      <Image source={{ uri: manualImage }} className="w-full h-full" resizeMode="cover" />
                    ) : (
                      <View className="items-center">
                        <Ionicons name="camera-outline" size={30} color="gray" />
                        <Text className="text-gray-400 text-xs mt-1">Add Photo</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text className="text-gray-400 text-xs mt-2">Tap to upload an image of your meal</Text>
                </View>

                <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-20">
                  <Text className="text-gray-700 font-bold mb-2">Food Name</Text>
                  <TextInput
                    value={manualName}
                    onChangeText={setManualName}
                    placeholder="e.g. Homemade Chicken Salad"
                    placeholderTextColor="#9CA3AF"
                    className="bg-gray-50 p-4 rounded-xl text-base mb-6 border border-gray-100"
                  />
                  <View className="flex-row flex-wrap justify-between">
                    {[
                      { label: 'Calories', value: manualCalories, setter: setManualCalories, unit: 'kcal' },
                      { label: 'Protein',  value: manualProtein,  setter: setManualProtein,  unit: 'g' },
                      { label: 'Carbs',    value: manualCarbs,    setter: setManualCarbs,    unit: 'g' },
                      { label: 'Fat',      value: manualFat,      setter: setManualFat,      unit: 'g' },
                    ].map(({ label, value, setter, unit }) => (
                      <View key={label} className="w-[48%] mb-4">
                        <Text className="text-gray-700 font-bold mb-2">{label}</Text>
                        <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-100 px-4">
                          <TextInput
                            value={value}
                            onChangeText={setter}
                            placeholder="0"
                            keyboardType="numeric"
                            className="flex-1 py-4 text-base"
                          />
                          <Text className="text-gray-400 text-sm">{unit}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={handleSaveManual}
                    className="bg-primary w-full py-4 rounded-xl items-center mt-4"
                  >
                    <Text className="text-white font-bold text-lg">Save Food</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {viewMode === 'recognition' && recognitionResult && (
              /* ── RECOGNITION RESULT VIEW ── */
              <FoodRecognitionResultModal
                result={recognitionResult}
                imageUri={recognitionImageUri}
                onUseFood={handleUseFoodFromRecognition}
                onEditDetails={handleEditRecognitionDetails}
                onTryAgain={handleRecognitionTryAgain}
                onSearchManually={() => { clearRecognitionState(); setViewMode('search'); }}
              />
            )}

            {/* Recognition loading overlay */}
            {recognitionLoading && (
              <View
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  justifyContent: 'center', alignItems: 'center', zIndex: 10,
                }}
              >
                <View style={{
                  backgroundColor: 'white', borderRadius: 20, padding: 28,
                  alignItems: 'center', marginHorizontal: 40,
                }}>
                  <ActivityIndicator size="large" color="#007BFF" />
                  <Text style={{ fontWeight: 'bold', fontSize: 16, marginTop: 16, color: '#111' }}>
                    Analysing your food...
                  </Text>
                  <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 4, textAlign: 'center' }}>
                    This may take a few seconds
                  </Text>
                </View>
              </View>
            )}

          </View>
        </KeyboardAvoidingView>

        {/* BARCODE SCANNER MODAL */}
        {barcodeScanning && (
          <Modal
            animationType="slide"
            transparent={false}
            visible={barcodeScanning}
            onRequestClose={() => setBarcodeScanning(false)}
          >
            <View className="flex-1 bg-black">
              {!cameraPermission ? (
                <View className="flex-1 justify-center items-center">
                  <ActivityIndicator size="large" color="white" />
                  <Text className="text-white mt-4">Requesting camera permission...</Text>
                </View>
              ) : !cameraPermission.granted ? (
                <View className="flex-1 justify-center items-center px-6">
                  <Ionicons name="alert-circle" size={60} color="white" />
                  <Text className="text-white text-xl font-bold mt-4 text-center">Camera Access Denied</Text>
                  <Text className="text-gray-300 text-center mt-2">
                    Enable camera permissions in settings to scan barcodes.
                  </Text>
                </View>
              ) : processingBarcode ? (
                <View className="flex-1 justify-center items-center px-6">
                  <ActivityIndicator size="large" color="white" />
                  <Text className="text-white mt-8 text-lg font-bold text-center">Looking up product...</Text>
                  <View className="mt-6 h-24 justify-center">
                    {processingStep >= 1 && (
                      <Text className="text-gray-300 text-center text-base leading-6 mb-2">
                        Reading the barcode and matching it against the food database.
                      </Text>
                    )}
                    {processingStep >= 2 && (
                      <Text className="text-gray-300 text-center text-sm leading-5">
                        This usually takes a few seconds. Please hold the camera steady.
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <>
                  <CameraView
                    style={{ flex: 1 }}
                    onBarcodeScanned={handleBarcodeScan}
                    barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_e', 'code128', 'code39'] }}
                  />
                  <View className="absolute top-0 left-0 right-0 bottom-0 justify-center items-center pointer-events-none">
                    <View className="w-64 h-64 border-2 border-green-400 rounded-lg" />
                    <Text className="text-white text-center mt-12 text-lg">Align barcode within frame</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setBarcodeScanning(false)}
                    className="absolute top-12 left-6 bg-primary rounded-full p-4"
                  >
                    <Ionicons name="close" size={24} color="white" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Modal>
        )}

        {/* In-modal alert overlay. Keeping this inside a full-screen parent lets
            the alert dim and center over the whole AddFoodModal without opening
            a second top-level native Modal on iOS. */}
        {alertVisible && (
          <View style={styles.alertOverlay}>
            <View className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl">
              <Text className="text-xl font-bold text-center text-gray-900 mb-2">
                {alertConfig.title}
              </Text>
              <Text className="text-gray-500 text-center mb-6 leading-5">
                {alertConfig.message}
              </Text>
              <TouchableOpacity
                onPress={() => setAlertVisible(false)}
                className="bg-primary py-3 rounded-xl items-center w-full"
              >
                <Text className="text-white font-bold">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  alertOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});

export default AddFoodModal;
