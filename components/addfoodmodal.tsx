/**
 * ADD FOOD MODAL COMPONENT
 *
 * Four view modes rendered inside a single Modal — no nested modals, no overlays:
 *   'search'      — search bar + results + 3 action buttons
 *   'manual'      — image, name, macros, save button
 *   'barcode'     — full-screen camera scanner (own nested Modal). Its own
 *                   stages render OVER the live frame: looking up, found,
 *                   edit, picker. The camera is never torn down between them.
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
import { confirmationType } from './confirmationTypography';
import PipBird from './pip/PipBird';
import { useAuth } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-camera';
// Search reads the self-owned catalogue through api/addFood, barcode through
// api/barcode (checklist Phase 3/4). Nothing here imports the frozen
// services/mealAPI.tsx or services/barcodeAPI.tsx any more.
import {
  searchCatalogFoods,
  toFoodCards,
  toLoggableFood,
  type CatalogSearchResponse,
  type CatalogSource,
  type FoodCardVM,
} from '../api/addFood/addFoodApi';
import type { ApiFailure } from '../api/core/request';
import { energyValue, parseEnergyInput } from '../utils/energy';
import FoodResultCard from './addfood/FoodResultCard';
import RefineRow from './addfood/RefineRow';
import SearchStateMessage from './addfood/SearchStateMessage';
import {
  emptyReportForm,
  findServing,
  lookupBarcode,
  normaliseBarcode,
  servingKey,
  toLoggableScannedFood,
  toScannedCardVM,
  type BarcodeHit,
  type BarcodeReportForm,
  type BarcodeSource,
} from '../api/barcode/barcodeApi';
import BarcodeScanner, { type BarcodeScanResult } from './addfood/BarcodeScanner';
import BarcodeLookupCard from './addfood/BarcodeLookupCard';
import BarcodeFoundSheet from './addfood/BarcodeFoundSheet';
import BarcodeEditForm from './addfood/BarcodeEditForm';
import MealServingPicker, { type MealTypeLabel } from './addfood/MealServingPicker';
import { recognizeFood } from '../services/foodRecognitionAPI';
import type { PredictionResult, FoodCandidate } from '../services/foodRecognitionAPI';
// CustomAlert was used previously, but it relies on a top-level Modal that
// stacks unreliably on top of AddFoodModal on iOS. The alert is now rendered
// as an in-modal overlay View near the bottom of this file.
import FoodRecognitionResultModal from './FoodRecognitionResultModal';
import { PIP_ACTION_MIN_LOADING_MS, PipActionStatusCard, usePipActionStatus } from './pip/PipActionStatusCard';
import { MealLogRequestError, type MealLogOutcome } from '../services/mealLogOutcome';

interface AddFoodModalProps {
  visible: boolean;
  onClose: () => void;
  mealType: string;
  /**
   * The parent's whole commit: POST, dirty flags, its own refreshes. It
   * RETURNS the resolved outcome (services/mealLogOutcome.ts) and THROWS on
   * failure; it must not close this modal or open a success surface of its
   * own. This modal owns the one loading-to-outcome card for the whole save
   * (redesign D5), which is what rules out a parent/child double overlay.
   */
  onAddFood: (foodItem: any) => Promise<MealLogOutcome>;
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
  // Results are FoodCardVMs (api/addFood mappers), never raw hits. Facets feed
  // the refine row; selectedSegments/selectedSource are the active filters and
  // re-run the last submitted query. lastFailure drives the honest empty
  // states: a 429 or a dropped connection must never read as "no foods".
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<FoodCardVM[]>([]);
  const [facets, setFacets] = useState<CatalogSearchResponse['facets'] | null>(null);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<CatalogSource | null>(null);
  const [lastFailure, setLastFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  const latestSearchRequestRef = useRef(0);
  // The in-flight search. Superseding a search aborts it (not just ignores it),
  // so a stale request cannot hold one of the OS's few connections (ERROR_LOG 064).
  const searchAbortRef = useRef<AbortController | null>(null);

  // --- MANUAL ENTRY ---
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualImage, setManualImage] = useState<string | null>(null);

  // --- SAVE LIFECYCLE ---
  // One Pip status card for every commit path (manual, search result, barcode-
  // filled manual, recognised food). Its guard runs before the first await, the
  // 800 ms floor and the settled→ready beat live in the hook, and the card is
  // rendered inside this modal's content (never a nested native Modal).
  const pipStatus = usePipActionStatus();
  // True from the tap until the user acknowledges the outcome. Blocks
  // close/back/re-tap for the whole operation, exactly as before.
  const isSavingFood = pipStatus.isBusy;

  const foodLabel = (food: any) => String(food?.title || food?.food_name || 'this food').trim();

  /**
   * The one way any path commits. `lookup` is the pre-save step and is part
   * of the awaited action, so the card is up for it too. On a successful
   * acknowledgement the modal closes itself; on an error it stays open with
   * the entered details intact.
   *
   * `targetMeal` defaults to the meal this modal was opened for. The scanner
   * passes the one chosen in the picker, and the food object carries it too,
   * because the PARENT is what actually writes mealType onto the log row.
   */
  const commitFood = (label: string, lookup: () => Promise<any>, targetMeal: string = mealType) =>
    pipStatus.run({
      loading: { title: `Adding ${label}…`, message: `Saving to ${targetMeal}` },
      context: { itemLabel: label, mealType: targetMeal },
      task: async () => {
        const food = await lookup();
        if (!food) {
          // Nothing was attempted against the log, so say so (status-carrying
          // error = "Nothing was saved" copy, not the ambiguous one).
          throw new MealLogRequestError('Could not load this food', 0);
        }
        return onAddFood(food);
      },
      onDismiss: (result) => {
        if (result.kind === 'success') closeAndReset();
      },
    });

  // --- BARCODE ---
  // One nested Modal for the whole scan, with a stage inside it (Design C).
  // The camera keeps running underneath every stage, which is what makes
  // "Scan another" instant and what the design is built around.
  //
  //   scanning → looking → found → (edit) → picker → the shared Pip card
  //
  // `report` is Phase 5; the stage exists here so the type is complete.
  type BarcodeStage = 'scanning' | 'looking' | 'found' | 'edit' | 'picker' | 'report';
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  const [barcodeStage, setBarcodeStage] = useState<BarcodeStage>('scanning');
  const [scannedCode, setScannedCode] = useState('');
  const [scannedHit, setScannedHit] = useState<BarcodeHit | null>(null);
  const [scannedSource, setScannedSource] = useState<BarcodeSource>('catalog');
  const [scanFailure, setScanFailure] = useState<ApiFailure | null>(null);
  const [lookupStage, setLookupStage] = useState<'catalog' | 'openfoodfacts'>('catalog');
  // Serving + quantity + meal for the picker. The meal starts as the one this
  // modal was opened for and is never inferred from the clock (checklist b0-03).
  const [chosenServingKey, setChosenServingKey] = useState<string | null>(null);
  const [chosenQuantity, setChosenQuantity] = useState(1);
  const [chosenMeal, setChosenMeal] = useState<string>(mealType);
  // The edit form, prefilled from the label so "Reset to label" has something
  // to go back to.
  const [editForm, setEditForm] = useState<BarcodeReportForm>(emptyReportForm());
  const [labelForm, setLabelForm] = useState<BarcodeReportForm>(emptyReportForm());
  const isProcessingRef = useRef(false);
  // A double decode of the same pack within this window asks before logging it
  // twice (checklist b4-07). expo-camera fires repeatedly while a barcode is in
  // frame, so without this a steady hand is a duplicate meal.
  const DUPLICATE_SCAN_WINDOW_MS = 60_000;
  const lastLoggedScanRef = useRef<{ barcode: string; at: number } | null>(null);

  // --- FOOD RECOGNITION ---
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<PredictionResult | null>(null);
  const [recognitionImageUri, setRecognitionImageUri] = useState<string | null>(null);

  // The client cannot see the server switch from the catalogue to the live
  // Open Food Facts call, so the second line lights up on elapsed time: past
  // this point a still-running lookup is almost always the fallback.
  useEffect(() => {
    if (barcodeStage !== 'looking') { setLookupStage('catalog'); return; }
    const timer = setTimeout(() => setLookupStage('openfoodfacts'), 700);
    return () => clearTimeout(timer);
  }, [barcodeStage]);

  // The picker opens on the meal this modal was opened for, every time.
  useEffect(() => { setChosenMeal(mealType); }, [mealType, visible]);

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
  // The lookup never flashes past: PIP_ACTION_MIN_LOADING_MS is the same floor
  // the save card uses, so the two steps of one scan feel like one rhythm.
  const MIN_LOOKUP_DISPLAY_MS = PIP_ACTION_MIN_LOADING_MS;

  const holdFor = async (startedAt: number, ms: number) => {
    const remaining = ms - (Date.now() - startedAt);
    if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  };

  /** The scanned label as form values, in the units the pack prints. */
  const labelFormFromHit = (hit: BarcodeHit): BarcodeReportForm => {
    const serving = hit.serving;
    const nutrition = serving?.nutrition ?? hit.nutrition;
    const text = (value: number | null | undefined) =>
      value === null || value === undefined || !Number.isFinite(value) ? '' : String(Math.round(value * 100) / 100);
    return {
      productName: hit.title ?? '',
      brand: hit.brand ?? '',
      servingSize: text(serving?.grams_equivalent),
      servingUnit: serving?.metric_unit === 'ml' ? 'ml' : 'g',
      energyKj: text(nutrition?.energy_kj),
      proteinG: text(nutrition?.protein_g),
      carbohydrateG: text(nutrition?.carbohydrate_g),
      fatG: text(nutrition?.fat_g),
      photoUrl: null,
    };
  };

  /** Everything the scanner owns, back to zero. */
  const resetScannerState = () => {
    isProcessingRef.current = false;
    setBarcodeScanning(false);
    setBarcodeStage('scanning');
    setScannedHit(null);
    setScannedCode('');
    setScanFailure(null);
    setChosenServingKey(null);
    setChosenQuantity(1);
    setEditForm(emptyReportForm());
    setLabelForm(emptyReportForm());
  };

  const startScanner = () => {
    setBarcodeStage('scanning');
    setScannedCode('');
    setScannedHit(null);
    setScanFailure(null);
    isProcessingRef.current = false;
    setBarcodeScanning(true);
  };

  const closeScanner = () => {
    if (isSavingFood) return;
    resetScannerState();
  };

  const handleBarcodeScan = async (result: BarcodeScanResult) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const code = normaliseBarcode(result?.data);
    setScannedCode(code);
    setScannedHit(null);
    setScanFailure(null);
    setBarcodeStage('looking');
    const startedAt = Date.now();

    const lookup = await lookupBarcode(code, { getToken, clerkId: userId });
    await holdFor(startedAt, MIN_LOOKUP_DISPLAY_MS);

    // A failure and a miss are different answers and must never be rendered as
    // each other (ERROR_LOG 063/065): ok first, found second.
    if (lookup.ok === false) {
      setScanFailure(lookup);
      setBarcodeStage('scanning');
      isProcessingRef.current = false;
      return;
    }

    if (!lookup.data.found || !lookup.data.item) {
      // Phase 5 puts the label-report form here. Until then, say so honestly
      // rather than dropping the user back at a live camera with no feedback.
      setScannedCode(lookup.data.barcode);
      setBarcodeStage('scanning');
      isProcessingRef.current = false;
      showCustomAlert(
        'Not in our catalogue yet',
        `We could not find barcode ${lookup.data.barcode}. Add it with "Add Food Manually" for now.`,
      );
      setBarcodeScanning(false);
      return;
    }

    const hit = lookup.data.item;
    const label = labelFormFromHit(hit);
    setScannedHit(hit);
    setScannedSource(lookup.data.source ?? 'catalog');
    setScannedCode(hit.barcode || lookup.data.barcode);
    setChosenServingKey(servingKey(hit.serving));
    setChosenQuantity(1);
    setLabelForm(label);
    setEditForm(label);
    setBarcodeStage('found');
    isProcessingRef.current = false;
  };

  const handleScanAgain = () => {
    setScannedHit(null);
    setScannedCode('');
    setScanFailure(null);
    setBarcodeStage('scanning');
    isProcessingRef.current = false;
  };

  /** Found → picker, or edit → picker. Same destination, same label. */
  const openServingPicker = () => setBarcodeStage('picker');

  const commitScannedFood = () => {
    if (!scannedHit) return;
    const now = Date.now();
    const previous = lastLoggedScanRef.current;
    if (previous && previous.barcode === scannedCode && now - previous.at < DUPLICATE_SCAN_WINDOW_MS) {
      showCustomAlert(
        'Already added',
        'You logged this same pack less than a minute ago. Scan it again to add another serving.',
      );
      lastLoggedScanRef.current = null; // the next tap goes through
      return;
    }

    const serving = findServing(scannedHit, chosenServingKey);
    const meal = String(chosenMeal || mealType).toLowerCase();
    const food = {
      ...toLoggableScannedFood(scannedHit, scannedSource, {
        servingKey: servingKey(serving),
        quantity: chosenQuantity,
      }),
      // The parent writes the log row, so the chosen meal travels with the
      // food. Without this the picker is decorative and a dinner scan lands
      // wherever the sheet happened to be opened from.
      mealType: meal,
    };
    lastLoggedScanRef.current = { barcode: scannedCode, at: now };
    commitFood(food.title, async () => food, meal);
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
    // C3: this used to call onAddFood without awaiting it, escaping the busy
    // guard entirely. It now runs the same lifecycle as every other path.
    void commitFood(foodLabel(newFood), async () => newFood);
  };

  const handleEditRecognitionDetails = (candidate: FoodCandidate) => {
    setManualName(candidate.display_name);
    if (candidate.nutrition) {
      setManualCalories(candidate.nutrition.calories != null ? String(energyValue(candidate.nutrition.calories) ?? '') : '');
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
  /**
   * Run one catalogue search. `filters` is the refine-row state to apply; a
   * fresh submit passes empty filters, a chip tap passes the new selection.
   * Each run supersedes the previous one twice over: the request id makes a
   * stale result invisible, and the AbortController stops it in flight.
   */
  const runSearch = async (
    text: string,
    filters: { segments: string[]; source: CatalogSource | null },
  ) => {
    const trimmedQuery = text.trim();
    if (!trimmedQuery) return;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;

    setLoading(true);
    setHasCompletedSearch(false);
    setLastFailure(null);

    const result = await searchCatalogFoods(
      { query: trimmedQuery, segments: filters.segments, source: filters.source },
      { getToken, clerkId: userId, signal: controller.signal },
    );

    if (latestSearchRequestRef.current !== requestId) return; // superseded: render nothing

    // `=== false`, not `!result.ok`: strictNullChecks is off in this project's
    // tsconfig, and without it TypeScript will not narrow a discriminated
    // union by truthiness (api/README.md, "Gotchas").
    if (result.ok === false) {
      if (result.kind === 'aborted') return;
      // Keep the last facets so an active chip can still be un-tapped after a
      // failure; the list itself shows the failure state, not "no foods".
      setResults([]);
      setLastFailure(result);
    } else {
      setResults(toFoodCards(result.data));
      setFacets(result.data.facets);
    }
    setLoading(false);
    setHasCompletedSearch(true);
  };

  // Submit (keyboard search key or the Search button): a new query starts
  // with no filters, otherwise a chip chosen for "beer" would silently narrow
  // the next search for "chicken".
  const handleSearch = () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    setSubmittedQuery(trimmedQuery);
    setSelectedSegments([]);
    setSelectedSource(null);
    void runSearch(trimmedQuery, { segments: [], source: null });
  };

  const handleToggleSegment = (label: string) => {
    if (isSavingFood || !submittedQuery) return;
    const next = selectedSegments.includes(label)
      ? selectedSegments.filter((s) => s !== label)
      : [...selectedSegments, label];
    setSelectedSegments(next);
    void runSearch(submittedQuery, { segments: next, source: selectedSource });
  };

  const handleSelectSource = (source: CatalogSource | null) => {
    if (isSavingFood || !submittedQuery) return;
    setSelectedSource(source);
    void runSearch(submittedQuery, { segments: selectedSegments, source });
  };

  const handleClearFilters = () => {
    if (isSavingFood || !submittedQuery) return;
    setSelectedSegments([]);
    setSelectedSource(null);
    void runSearch(submittedQuery, { segments: [], source: null });
  };

  const handleRetrySearch = () => {
    if (isSavingFood || !submittedQuery) return;
    void runSearch(submittedQuery, { segments: selectedSegments, source: selectedSource });
  };

  const handleSearchTextChange = (text: string) => {
    latestSearchRequestRef.current += 1;
    searchAbortRef.current?.abort();
    setQuery(text);
    setResults([]);
    setFacets(null);
    setSelectedSegments([]);
    setSelectedSource(null);
    setLastFailure(null);
    setLoading(false);
    setHasCompletedSearch(false);
  };

  const handleAddClick = (vm: FoodCardVM) => {
    // One round trip, not two: the search hit already carries the default
    // serving and its nutrition profile, so there is no detail lookup before
    // the parent's POST (checklist p0-04; ERROR_LOG 071 documented the 3–4 s
    // window the FatSecret two-step created). The card's task still spans the
    // whole save, so a second tap can never log twice.
    void commitFood(vm.title, async () => toLoggableFood(vm));
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
    if (isSavingFood) return;
    if (!manualName || !manualCalories) {
      showCustomAlert('Missing Fields', 'Please enter at least a Food Name and Calories.');
      return;
    }
    void commitFood(manualName.trim(), async () => ({
      title: manualName,
      calories: parseEnergyInput(manualCalories) ?? 0, // field is kJ; meal_logs.calories is kcal
      protein: parseFloat(manualProtein) || 0,
      carbs: parseFloat(manualCarbs) || 0,
      fats: parseFloat(manualFat) || 0,
      image: manualImage || '',
      food_name: manualName,
      type: 'manual',
    }));
  };

  const resetManualForm = () => {
    setManualName(''); setManualCalories(''); setManualProtein('');
    setManualCarbs(''); setManualFat(''); setManualImage(null);
    setViewMode('search');
  };

  const resetSearchState = () => {
    latestSearchRequestRef.current += 1;
    searchAbortRef.current?.abort();
    setQuery(''); setSubmittedQuery(''); setResults([]); setFacets(null);
    setSelectedSegments([]); setSelectedSource(null); setLastFailure(null);
    setLoading(false); setHasCompletedSearch(false);
  };

  const closeAndReset = () => {
    resetManualForm();
    resetSearchState();
    clearRecognitionState();
    // Dismiss the scanner explicitly rather than letting it unmount with its
    // parent: a nested Modal torn down by its parent disappearing is the kind
    // of iOS stacking wobble this file has had before (Errors 019, 055).
    resetScannerState();
    onClose();
  };

  const handleClose = () => {
    if (isSavingFood) return; // don't let the user dismiss mid-save (any path)
    closeAndReset();
  };

  const handleBackPress = () => {
    if (isSavingFood) return; // don't leave the form while a save is in flight
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
                <TouchableOpacity onPress={handleBackPress} disabled={isSavingFood} className="p-2">
                  <Ionicons name="arrow-back" size={24} color={isSavingFood ? '#D1D5DB' : 'black'} />
                </TouchableOpacity>
              ) : (
                <View className="w-8" />
              )}
              <Text className="text-xl font-bold text-black capitalize">{headerTitle}</Text>
              <TouchableOpacity onPress={handleClose} disabled={isSavingFood} className="bg-gray-100 p-2 rounded-full">
                <Ionicons name="close" size={20} color={isSavingFood ? '#D1D5DB' : 'black'} />
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

                <RefineRow
                  facets={facets}
                  selectedSegments={selectedSegments}
                  selectedSource={selectedSource}
                  onToggleSegment={handleToggleSegment}
                  onSelectSource={handleSelectSource}
                  onClearAll={handleClearFilters}
                  disabled={isSavingFood || loading}
                />

                {loading ? (
                  <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
                ) : (
                  <FlatList
                    data={results}
                    keyExtractor={(item) => item.key}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    // Cards grew by a chip row; the bar below is ~230 px tall.
                    contentContainerStyle={{ paddingBottom: 240 }}
                    renderItem={({ item }) => (
                      // Every row is disabled while any add is in flight, not just
                      // the tapped one — otherwise a second tap logs a second meal.
                      <FoodResultCard vm={item} onAdd={handleAddClick} disabled={isSavingFood} />
                    )}
                    ListEmptyComponent={
                      hasCompletedSearch && submittedQuery
                        ? (
                          <SearchStateMessage
                            state={lastFailure ? { kind: 'failure', failure: lastFailure, query: submittedQuery } : { kind: 'empty', query: submittedQuery }}
                            onRetry={handleRetrySearch}
                            disabled={isSavingFood}
                          />
                        )
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
                    onPress={startScanner}
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
                      { label: 'Energy', value: manualCalories, setter: setManualCalories, unit: 'kJ' },
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
                    disabled={isSavingFood}
                    className={`w-full py-4 rounded-xl items-center mt-4 flex-row justify-center ${isSavingFood ? 'bg-blue-300' : 'bg-primary'}`}
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
            onRequestClose={closeScanner}
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
                  <TouchableOpacity onPress={closeScanner} className="mt-6 px-6 py-3 rounded-full bg-primary">
                    <Text className="text-white font-bold">Close</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* The camera stays mounted under every stage: tearing it
                      down and rebuilding it between steps is what made the old
                      flow feel like three separate screens. */}
                  <BarcodeScanner
                    active={barcodeStage === 'scanning' && !isSavingFood}
                    onScanned={handleBarcodeScan}
                    onClose={closeScanner}
                    showClose={barcodeStage === 'scanning'}
                  />

                  {/* A lookup that failed is not a product we do not have. It
                      says so on the live frame and lets the user try again. */}
                  {barcodeStage === 'scanning' && scanFailure && (
                    <View className="absolute left-0 right-0 bottom-0 px-4 pb-10">
                      <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(15,23,42,0.92)' }}>
                        <Text className="text-white font-bold text-[14px]">
                          {scanFailure.kind === 'offline'
                            ? "Can't reach GoodHealthMate"
                            : scanFailure.kind === 'throttled'
                              ? 'You are scanning a bit fast'
                              : scanFailure.kind === 'timeout'
                                ? 'That took too long'
                                : 'That scan did not work'}
                        </Text>
                        <Text className="text-[12.5px] mt-1" style={{ color: '#CBD5E1' }}>
                          {scanFailure.message} Point the camera at the barcode to try again.
                        </Text>
                      </View>
                    </View>
                  )}

                  {barcodeStage === 'looking' && (
                    <BarcodeLookupCard barcode={scannedCode} stage={lookupStage} />
                  )}

                  {barcodeStage === 'found' && scannedHit && (
                    <BarcodeFoundSheet
                      vm={toScannedCardVM(scannedHit)}
                      barcode={scannedCode}
                      source={scannedSource}
                      onAdd={openServingPicker}
                      onEdit={() => setBarcodeStage('edit')}
                      onScanAgain={handleScanAgain}
                      onClose={closeScanner}
                      disabled={isSavingFood}
                    />
                  )}

                  {barcodeStage === 'edit' && scannedHit && (
                    <BarcodeEditForm
                      form={editForm}
                      barcode={scannedCode}
                      isPristine={JSON.stringify(editForm) === JSON.stringify(labelForm)}
                      onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))}
                      onReset={() => setEditForm(labelForm)}
                      onSubmit={openServingPicker}
                      onBack={() => setBarcodeStage('found')}
                      onClose={closeScanner}
                      disabled={isSavingFood}
                    />
                  )}

                  {barcodeStage === 'picker' && scannedHit && !isSavingFood && (
                    <MealServingPicker
                      servings={scannedHit.servings}
                      selectedServingKey={chosenServingKey}
                      quantity={chosenQuantity}
                      selectedMeal={chosenMeal}
                      onChangeServing={setChosenServingKey}
                      onChangeQuantity={setChosenQuantity}
                      onChangeMeal={(meal: MealTypeLabel) => setChosenMeal(meal)}
                      onConfirm={commitScannedFood}
                      onCancel={() => setBarcodeStage(scannedHit ? 'found' : 'scanning')}
                    />
                  )}

                  {/* The save card lives wherever the user is looking. While
                      the scanner Modal is up it must render INSIDE it, or it
                      would be hidden behind the camera (ERROR_LOG 019, 055:
                      never a second native Modal). */}
                  <PipActionStatusCard {...pipStatus.cardProps} />
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
            <View className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl items-center">
              {/* Every alert raised from this modal is a permission or validation
                  failure, so the sad bird is unconditional here. Matches what
                  CustomAlert derives for the same kind of message elsewhere. */}
              <View className="items-center justify-end mb-2" style={{ height: 96 }}>
                {alertVisible && <PipBird size={96} state="sad" />}
              </View>
              {/* Shared confirmation type scale — see confirmationTypography.ts */}
              <Text style={confirmationType.title} className="mb-2">
                {alertConfig.title}
              </Text>
              <Text style={confirmationType.message} className="mb-6">
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

        {/* The one loading-to-outcome card for every commit path. A plain
            absolute-fill View inside this modal's content, never a nested
            Modal (Errors 019, 055); it swallows touches so it guards the whole
            surface, and sits above alertOverlay so a save in flight always
            wins the layer order.

            While the scanner Modal is open it renders INSIDE that Modal
            instead (see above): this copy would be behind the camera, and
            rendering both would run two copies of one status. */}
        {!barcodeScanning && <PipActionStatusCard {...pipStatus.cardProps} style={styles.savingOverlay} />}
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
  // Sits above alertOverlay so a save in flight always wins the layer order.
  // Only the layer order: the card brings its own backdrop and geometry.
  savingOverlay: {
    zIndex: 10000,
    elevation: 10000,
  },
});

export default AddFoodModal;
