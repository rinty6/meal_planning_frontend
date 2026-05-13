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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { searchFoodItems, getFoodById } from '../services/mealAPI';
import { fetchBarcodeData } from '../services/barcodeAPI';
import { recognizeFood } from '../services/foodRecognitionAPI';
import type { PredictionResult, FoodCandidate } from '../services/foodRecognitionAPI';
import CustomAlert from '../components/customAlert';
import FoodRecognitionResultModal from './FoodRecognitionResultModal';

interface AddFoodModalProps {
  visible: boolean;
  onClose: () => void;
  mealType: string;
  onAddFood: (foodItem: any) => void;
}

const AddFoodModal = ({ visible, onClose, mealType, onAddFood }: AddFoodModalProps) => {
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
  const handleBarcodeScan = async (data: any) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setProcessingBarcode(true);

    try {
      const response = await fetchBarcodeData(data.data);

      if (!response.success || !response.data) {
        isProcessingRef.current = false;
        setProcessingBarcode(false);
        setBarcodeScanning(false);
        setTimeout(() => showCustomAlert('Product Not Found',
          `We couldn't find barcode ${data.data}.\n\nTry scanning again or add manually.`), 100);
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
      showCustomAlert('Success!', 'Product data loaded. Review and save.');
    } catch {
      isProcessingRef.current = false;
      setProcessingBarcode(false);
      setBarcodeScanning(false);
      setTimeout(() => showCustomAlert('Error', 'Could not process barcode. Try again.'), 100);
    }
  };

  // --- FOOD RECOGNITION ---
  const handleScanFood = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showCustomAlert('Camera Access Required', 'Enable camera permissions to scan food.');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (pickerResult.canceled || !pickerResult.assets?.length) return;

    const uri = pickerResult.assets[0].uri;
    setRecognitionImageUri(uri);
    setRecognitionLoading(true);

    try {
      const prediction = await recognizeFood(uri);
      setRecognitionResult(prediction);
      setViewMode('recognition');
    } catch (error) {
      showCustomAlert('Recognition Failed',
        'Could not analyse the image. Check your connection and try again with a clearer, well-lit photo.');
    } finally {
      setRecognitionLoading(false);
    }
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
    setTimeout(() => handleScanFood(), 400);
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
                          <Text className="text-gray-500 text-xs mt-1" numberOfLines={2}>{item.description}</Text>
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
                  <View className="flex-row">
                    <TouchableOpacity
                      onPress={() => setBarcodeScanning(true)}
                      className="flex-1 border-2 border-primary py-3 rounded-xl items-center flex-row justify-center mr-2"
                    >
                      <Ionicons name="barcode-outline" size={18} color="#007BFF" />
                      <Text className="text-primary font-bold ml-2">Scan Barcode</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleScanFood}
                      className="flex-1 border-2 border-primary py-3 rounded-xl items-center flex-row justify-center"
                    >
                      <Ionicons name="camera-outline" size={18} color="#007BFF" />
                      <Text className="text-primary font-bold ml-2">Scan Food</Text>
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
                  <Text className="text-white mt-8 text-lg font-bold text-center">Processing Barcode...</Text>
                  <View className="mt-6 h-24 justify-center">
                    {processingStep >= 1 && <Text className="text-gray-300 text-center text-base leading-6 mb-3">🔍 Scanning product database</Text>}
                    {processingStep >= 2 && <Text className="text-gray-300 text-center text-base leading-6 mb-3">📊 Retrieving nutritional information</Text>}
                    {processingStep >= 2 && <Text className="text-gray-300 text-center text-base leading-6">⏳ Please wait a moment...</Text>}
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
      </Modal>

      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText="Close"
        onConfirm={() => setAlertVisible(false)}
      />
    </>
  );
};

export default AddFoodModal;
