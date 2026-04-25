/**
 * ADD FOOD MODAL COMPONENT
 *
 * This file handles adding food items through multiple methods:
 * 1. Search API (existing mealAPI)
 * 2. Manual entry (existing)
 * 3. BARCODE SCANNING (new - Open Food Facts integration)
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
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { searchFoodItems, getFoodById } from '../services/mealAPI';
import { fetchBarcodeData } from '../services/barcodeAPI';
import CustomAlert from '../components/customAlert'; // Ensure this path is correct

interface AddFoodModalProps {
  visible: boolean;
  onClose: () => void;
  mealType: string;
  onAddFood: (foodItem: any) => void;
}

const AddFoodModal = ({ visible, onClose, mealType, onAddFood }: AddFoodModalProps) => {
  // VIEW MODE: 'search' or 'manual' or 'barcode'
  const [viewMode, setViewMode] = useState<'search' | 'manual' | 'barcode'>('search');

  // --- CUSTOM ALERT STATE ---
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const showCustomAlert = (title: string, message: string) => {
    setAlertConfig({ title, message });
    setAlertVisible(true);
  };

  // --- SEARCH STATE ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const latestSearchRequestRef = useRef(0);

  // --- MANUAL ENTRY STATE ---
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualImage, setManualImage] = useState<string | null>(null); 

  // --- BARCODE SCANNING STATE ---
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [processingBarcode, setProcessingBarcode] = useState(false);
  const [processingStep, setProcessingStep] = useState(0); // Track which step is displayed (0, 1, 2)
  
  // Synchronous lock to prevent camera spam (The 502 Error Fix)
  const isProcessingRef = useRef(false);

  // Sequential step animation during barcode processing
  useEffect(() => {
    if (!processingBarcode) {
      setProcessingStep(0);
      return;
    }

    const step1Timer = setTimeout(() => setProcessingStep(1), 800);
    const step2Timer = setTimeout(() => setProcessingStep(2), 1600);

    return () => {
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
    };
  }, [processingBarcode]);

  // --- REQUEST CAMERA PERMISSION ---
  useEffect(() => {
    if (barcodeScanning) {
      if (!cameraPermission?.granted) {
        requestCameraPermissionHandler();
      }
    }
  }, [barcodeScanning]);

  const requestCameraPermissionHandler = async () => {
    console.log('🎥 [BARCODE MODAL] Requesting camera permission...');
    const permission = await requestCameraPermission();
    console.log(`🎥 [BARCODE MODAL] Camera permission status: ${permission?.granted}`);

    if (!permission?.granted) {
      showCustomAlert(
        'Camera Access Required',
        'We need camera access to scan barcodes. Please enable camera permissions in your settings.'
      );
      setBarcodeScanning(false);
    }
  };

  // --- HANDLE BARCODE SCAN ---
  const handleBarcodeScan = async (data: any) => {
    // If the door is locked (already processing a scan), ignore everything else instantly!
    if (isProcessingRef.current) return;
    
    // Instantly lock the door
    isProcessingRef.current = true;
    setProcessingBarcode(true);
    console.log(` [BARCODE MODAL] Barcode detected: ${data.data}`);

    try {
      console.log(' [BARCODE MODAL] Fetching product data from Open Food Facts...');
      const response = await fetchBarcodeData(data.data);

      if (!response.success || !response.data) {
        console.log('[BARCODE MODAL] Product not found, closing scanner...');
        
        // Close scanner IMMEDIATELY before alert to avoid modal stacking
        isProcessingRef.current = false;
        setProcessingBarcode(false);
        setBarcodeScanning(false);
        
        // Show alert after scanner is completely closed
        setTimeout(() => {
          showCustomAlert(
            'Product Not Found',
            `We couldn't find the food item for barcode ${data.data} in our database.\n\nTry scanning again or manually enter the food information.`
          );
        }, 100);
        return;
      }

      console.log('[BARCODE MODAL] Product found! Auto-filling form fields...');
      const { foodName, calories, protein, carbs, fats, image } = response.data;

      setManualName(foodName);
      setManualCalories(calories.toString());
      setManualProtein(protein.toString());
      setManualCarbs(carbs.toString());
      setManualFat(fats.toString());

      if (image) {
        setManualImage(image);
        console.log(`[BARCODE MODAL] Set product image`);
      }

      setViewMode('manual');
      setBarcodeScanning(false);
      
      // Unlock for the future
      isProcessingRef.current = false;
      setProcessingBarcode(false);

      showCustomAlert('Success!', 'Product data loaded. Review and save the food item.');

    } catch (error) {
      console.error(' [BARCODE MODAL] Error processing barcode:', error);
      
      isProcessingRef.current = false;
      setProcessingBarcode(false);
      setBarcodeScanning(false);
      
      // Show alert after scanner is completely closed
      setTimeout(() => {
        showCustomAlert(
          'Error Processing Barcode',
          'An error occurred while processing the barcode. Please try scanning again or enter the food information manually.'
        );
      }, 100);
    }
  };

  // 1. HANDLE SEARCH (Existing Logic)
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
    } catch (error) {
      console.error('Search error:', error);
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

  // 2. Add from Search
  const handleAddClick = async (id: string) => {
    setAddingId(id);
    try {
      const detailedFood = await getFoodById(id);
      if (detailedFood) {
        onAddFood(detailedFood);
      }
    } catch (error) {
      console.error('Error adding food:', error);
    } finally {
      setAddingId(null);
    }
  };

  // 3. Image Picker Logic
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      showCustomAlert("Permission Required", "You need to allow access to your photos to upload an image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const base64Image = `data:image/jpeg;base64,${asset.base64}`;
      setManualImage(base64Image);
    }
  };

  // 4. Save Manual Food
  const handleSaveManual = () => {
    if (!manualName || !manualCalories) {
      showCustomAlert("Missing Fields", "Please enter at least a Food Name and Calories.");
      return;
    }

    const newFood = {
      title: manualName,
      calories: parseFloat(manualCalories) || 0,
      protein: parseFloat(manualProtein) || 0,
      carbs: parseFloat(manualCarbs) || 0,
      fats: parseFloat(manualFat) || 0,
      image: manualImage || "", 
      food_name: manualName,
      type: 'manual'
    };

    onAddFood(newFood);
    resetManualForm();
  };

  const resetManualForm = () => {
    setManualName('');
    setManualCalories('');
    setManualProtein('');
    setManualCarbs('');
    setManualFat('');
    setManualImage(null);
    setViewMode('search'); 
  };

  const resetSearchState = () => {
    setQuery('');
    setResults([]);
    setLoading(false);
    setHasCompletedSearch(false);
    setAddingId(null);
    latestSearchRequestRef.current += 1;
  };

  const handleClose = () => {
    resetManualForm();
    resetSearchState();
    onClose();
  };

  return (
    <>
      <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-black/50 justify-end"
        >
          <View className="h-[90%] bg-white rounded-t-3xl shadow-xl overflow-hidden">

            {/* --- HEADER --- */}
            <View className="px-5 pt-5 pb-2 flex-row justify-between items-center border-b border-gray-100">
              {viewMode === 'manual' ? (
                <TouchableOpacity onPress={() => setViewMode('search')} className="p-2">
                  <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>
              ) : (
                <View className="w-8" />
              )}

              <Text className="text-xl font-bold text-black capitalize">
                {viewMode === 'manual' ? 'Add Custom Food' : `Add to ${mealType}`}
              </Text>

              <TouchableOpacity onPress={handleClose} className="bg-gray-100 p-2 rounded-full">
                <Ionicons name="close" size={20} color="black" />
              </TouchableOpacity>
            </View>

            {/* --- CONTENT --- */}
            {viewMode === 'search' ? (
              /* ================= SEARCH VIEW ================= */
              <View className="flex-1 p-5">
                <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3 mb-4">
                  <Ionicons name="search" size={20} color="gray" />
                  <TextInput
                    className="flex-1 ml-2 text-base text-black"
                    placeholder="Search (e.g., Chicken)"
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
                    contentContainerStyle={{ paddingBottom: 100 }}
                    renderItem={({ item }) => (
                      <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center">
                        <View className="flex-1 mr-4">
                          <Text className="text-lg font-bold text-black">{item.title}</Text>
                          <Text className="text-gray-500 text-xs mt-1" numberOfLines={2}>
                            {item.description}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleAddClick(item.id)}
                          disabled={addingId === item.id}
                          className="bg-primary px-5 py-2 rounded-full"
                        >
                          {addingId === item.id ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Text className="text-white font-bold">Add</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                    ListEmptyComponent={
                      hasCompletedSearch && query.trim().length > 0 ? (
                        <Text className="text-center text-gray-400 mt-10">No foods found.</Text>
                      ) : null
                    }
                  />
                )}

                <TouchableOpacity
                  onPress={() => setViewMode('manual')}
                  className="bg-primary w-full py-4 rounded-xl items-center absolute bottom-10 self-center shadow-lg"
                >
                  <Text className="text-white font-bold text-lg">+ Add Food Manually</Text>
                </TouchableOpacity>
              </View>

            ) : (
              /* ================= MANUAL VIEW ================= */
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
                    <View className="w-[48%] mb-4">
                      <Text className="text-gray-700 font-bold mb-2">Calories</Text>
                      <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-100 px-4">
                        <TextInput
                          value={manualCalories}
                          onChangeText={setManualCalories}
                          placeholder="0"
                          keyboardType="numeric"
                          className="flex-1 py-4 text-base"
                        />
                        <Text className="text-gray-400 text-sm">kcal</Text>
                      </View>
                    </View>

                    <View className="w-[48%] mb-4">
                      <Text className="text-gray-700 font-bold mb-2">Protein</Text>
                      <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-100 px-4">
                        <TextInput
                          value={manualProtein}
                          onChangeText={setManualProtein}
                          placeholder="0"
                          keyboardType="numeric"
                          className="flex-1 py-4 text-base"
                        />
                        <Text className="text-gray-400 text-sm">g</Text>
                      </View>
                    </View>

                    <View className="w-[48%] mb-4">
                      <Text className="text-gray-700 font-bold mb-2">Carbs</Text>
                      <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-100 px-4">
                        <TextInput
                          value={manualCarbs}
                          onChangeText={setManualCarbs}
                          placeholder="0"
                          keyboardType="numeric"
                          className="flex-1 py-4 text-base"
                        />
                        <Text className="text-gray-400 text-sm">g</Text>
                      </View>
                    </View>

                    <View className="w-[48%] mb-4">
                      <Text className="text-gray-700 font-bold mb-2">Fat</Text>
                      <View className="flex-row items-center bg-gray-50 rounded-xl border border-gray-100 px-4">
                        <TextInput
                          value={manualFat}
                          onChangeText={setManualFat}
                          placeholder="0"
                          keyboardType="numeric"
                          className="flex-1 py-4 text-base"
                        />
                        <Text className="text-gray-400 text-sm">g</Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleSaveManual}
                    className="bg-primary w-full py-4 rounded-xl items-center mt-4"
                  >
                    <Text className="text-white font-bold text-lg flex-row items-center">
                      <Ionicons name="checkmark" size={20} color="white" /> Save Food
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setBarcodeScanning(true)}
                    className="border-2 border-primary w-full py-4 rounded-xl items-center mt-3"
                  >
                    <View className="flex-row items-center">
                      <Ionicons name="barcode" size={20} color="#007BFF" />
                      <Text className="text-primary font-bold text-lg ml-2">Scan Barcode</Text>
                    </View>
                    <Text className="text-textSecondary text-xs mt-1 text-center">
                      Some dishes may not be recognised by the app.
                    </Text>
                  </TouchableOpacity>

                </View>
              </ScrollView>
            )}

          </View>
        </KeyboardAvoidingView>

        {/* ============================================
        BARCODE SCANNER MODAL
        ============================================ */}
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
                    Please enable camera permissions in your settings to scan barcodes.
                  </Text>
                </View>
              ) : processingBarcode ? (
                <View className="flex-1 justify-center items-center px-6">
                  <ActivityIndicator size="large" color="white" />
                  <Text className="text-white mt-8 text-lg font-bold text-center">Processing Barcode...</Text>
                  <View className="mt-6 h-24 justify-center">
                    {processingStep >= 1 && (
                      <Text className="text-gray-300 text-center text-base leading-6 mb-3">
                        🔍 Scanning product database
                      </Text>
                    )}
                    {processingStep >= 2 && (
                      <Text className="text-gray-300 text-center text-base leading-6 mb-3">
                        📊 Retrieving nutritional information
                      </Text>
                    )}
                    {processingStep >= 2 && (
                      <Text className="text-gray-300 text-center text-base leading-6">
                        ⏳ Please wait a moment...
                      </Text>
                    )}
                  </View>
                </View>
              ) : (
                <>
                  <CameraView
                    style={{ flex: 1 }}
                    onBarcodeScanned={handleBarcodeScan}
                    barcodeScannerSettings={{
                      barcodeTypes: ['ean13', 'ean8', 'upc_e', 'code128', 'code39'],
                    }}
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

      {/* Render the Custom Alert on top of everything */}
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
