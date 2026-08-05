/**
 * VOICE SEARCH MODAL — design variant 1a "Classic"
 * (claude_memory/app_video/voice-recognition-food-search-feature/project/VoicePhone.dc.html)
 *
 * Screens rendered inside a single Modal, mirroring addfoodmodal.tsx's
 * one-modal / view-mode pattern — no nested modals:
 *   'chooser'   — bottom sheet: Food / Recipe
 *   'listening' — full screen: waveform + live transcript + stop
 *   'searching' — full screen: shimmer skeletons
 *   'results'   — bottom sheet: ranked matches + actions
 *   'notfound'  — built in Phase 6
 *
 * ANIMATIONS: React Native's classic `Animated` API with useNativeDriver only.
 * Do NOT use react-native-reanimated worklets here — babel.config.js sets
 * worklets:false and New Architecture is off, so worklet code silently fails
 * (see StartupLoadingAnimation.tsx and ERROR_LOG Error 007).
 *
 * OVERLAYS: the meal picker and the success/error status card (InlineStatusOverlay)
 * are plain Views layered inside this Modal, never nested <Modal>s — those stack
 * unreliably on top of a Modal on iOS (same reason addfoodmodal.tsx renders its
 * alert as an in-modal overlay).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Linking,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useVoiceRecognition } from '../hooks/useVoiceRecognition';
import { searchFoodItems, searchRecipes } from '../services/mealAPI';
import { authedFetch } from '../services/authedFetch';
import { markMealsSummaryDirty } from '../services/mealsSummaryStore';
import InlineStatusOverlay, { type InlineStatusVariant } from './InlineStatusOverlay';
import { type PipState } from './pip/PipBird';

type VoiceSearchMode = 'food' | 'recipe';
type VoiceSearchScreen = 'chooser' | 'listening' | 'searching' | 'results' | 'notfound';
type MealType = 'breakfast' | 'lunch' | 'dinner';

interface VoiceSearchModalProps {
  visible: boolean;
  onClose: () => void;
}

// Recognition can return a whole sentence; cap it before it ever reaches a search call.
const MAX_TRANSCRIPT_LENGTH = 80;
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

// Design 1a "Classic" palette — keep in sync with VoicePhone.dc.html's classicPal.
const PAL = {
  overlay: 'rgba(11,33,73,0.42)',
  sheetBg: '#fff',
  grip: '#E2E8F0',
  txt: '#0B2149',
  sub: '#6B7280',
  accent: '#007BFF',
  optBg: '#F7FAFF',
  optLine: '#E3ECF7',
  listenTxt: '#0B2149',
  listenSub: '#6B87AD',
  pillBg: '#fff',
  stopBg: '#fff',
  searchBg: '#EFF3F7',
  searchTxt: '#0B2149',
  searchSub: '#6B7280',
  cardBg: '#fff',
  cardTxt: '#0B2149',
  cardSub: '#6B7280',
  cardLine: '#E5EBF2',
  shim1: '#EDF1F6',
  shim2: '#F7FAFD',
  resBg: '#F1F5FA',
  resTxt: '#0B2149',
  resLine: '#E5EBF2',
  closeBg: '#E9EEF5',
  ghostBg: '#fff',
  danger: '#EF4444',
};

/* ------------------------------------------------------------------ helpers */

const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMacro = (value: any) => {
  const parsed = toNumber(value);
  return parsed % 1 === 0 ? String(parsed) : parsed.toFixed(1);
};

// Matches summary.tsx: show 1 / 1.5 / 2, never "1.0".
const formatServings = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Servings move in 0.5 steps and never go below 0.5, mirroring comboDetail.tsx's
// stepper and the +/- controls on the meal summary rows.
const stepServings = (current: number, delta: number) =>
  Math.max(0.5, Math.round((current + delta) * 2) / 2);

const matchTokens = (value: string) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// FatSecret returns no relevance score, so the design's confidence badge is derived
// locally: how much of what the user said appears in the result's name, lightly
// penalised for extra words the user did not say. Cosmetic + ordering only — it
// never filters a result out.
const matchPercent = (query: string, title: string) => {
  const q = matchTokens(query);
  const t = matchTokens(title);
  if (!q.length || !t.length) return 0;
  const titleWords = new Set(t);
  const hits = q.filter((word) => titleWords.has(word)).length;
  const coverage = hits / q.length;
  const precision = hits / t.length;
  return Math.round((coverage * 0.75 + precision * 0.25) * 100);
};

const confMeta = (score: number) => {
  if (score >= 95) return { color: '#0E9F6E', bg: '#DFF7EF' };
  if (score >= 90) return { color: '#007BFF', bg: '#E7F1FF' };
  return { color: '#E67E00', bg: '#FFF2E0' };
};

const buildServingText = (item: any, mode: VoiceSearchMode) => {
  if (mode === 'recipe') {
    const time = String(item?.time ?? '').trim();
    return time ? `1 serving · ${time}` : '1 serving';
  }
  const description = String(item?.serving_description ?? '').trim();
  if (description) return description;
  const amount = toNumber(item?.metric_serving_amount);
  const unit = String(item?.metric_serving_unit ?? '').trim();
  return amount && unit ? `Per ${amount} ${unit}` : 'Per serving';
};

/* --------------------------------------------------------------- primitives */

const FadeIn = ({
  duration = 250,
  style,
  children,
}: {
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [duration, opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
};

// Sweeping gradient placeholder. CSS animates background-position, which RN has
// no equivalent for, so a full-width gradient is translated across instead.
const ShimmerBlock = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!width) return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [width, sweep]);

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });

  return (
    <View style={[styles.shimmerBase, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[PAL.shim1, PAL.shim2, PAL.shim1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
};

const RecordingDot = () => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 1000, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 1000, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.recordingDot, { opacity }]} />;
};

const WAVEFORM_BARS = 26;

// Each bar keeps the design's per-index duration/delay/opacity so the row reads as
// speech rather than a synchronised equaliser.
const WaveformBar = ({ index }: { index: number }) => {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = 620 + ((index * 137) % 520);
    const anim = Animated.sequence([
      Animated.delay((index * 90) % 700),
      Animated.loop(
        Animated.sequence([
          Animated.timing(grow, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(grow, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [index, grow]);

  const scaleY = grow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] });

  return <Animated.View style={[styles.waveBar, { opacity: 0.55 + (index % 3) * 0.16, transform: [{ scaleY }] }]} />;
};

const Waveform = () => (
  <View style={styles.waveRow}>
    {Array.from({ length: WAVEFORM_BARS }, (_, i) => (
      <WaveformBar key={i} index={i} />
    ))}
  </View>
);

/* --------------------------------------------------------------- main modal */

const VoiceSearchModal = ({ visible, onClose }: VoiceSearchModalProps) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, userId } = useAuth();

  const [screen, setScreen] = useState<VoiceSearchScreen>('chooser');
  const [mode, setMode] = useState<VoiceSearchMode>('food');
  const [transcript, setTranscript] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [throttled, setThrottled] = useState(false);
  const [pendingItem, setPendingItem] = useState<any>(null);
  const [logServings, setLogServings] = useState(1);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [statusOverlay, setStatusOverlay] = useState<{ variant: InlineStatusVariant; title: string; message: string; pip?: PipState } | null>(null);

  // Same guard as addfoodmodal.tsx: a slow earlier search must never overwrite a
  // newer one's results.
  const latestSearchRequestRef = useRef(0);

  const { state, interimTranscript, finalTranscript, error, start, stop, reset } = useVoiceRecognition();

  const modeWord = mode === 'food' ? 'food' : 'recipe';

  // `pip` is optional: only the meal-logged confirmations carry the bird, so
  // search and sign-in messages keep the plain icon card.
  const flashStatus = useCallback((variant: InlineStatusVariant, title: string, message: string, pip?: PipState) => {
    setStatusOverlay({ variant, title, message, pip });
  }, []);

  const runSearch = useCallback(async (rawText: string, searchMode: VoiceSearchMode) => {
    const text = rawText.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
    if (!text) return;

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;

    setScreen('searching');
    setSearchFailed(false);
    setThrottled(false);

    // Captured by the shared FatSecret proxy helper so a 429 can be told apart
    // from a genuinely empty result — without this, a throttled request looked
    // identical to "no match" and told the user their food doesn't exist.
    let wasThrottled = false;
    const onStatus = ({ throttled: hitLimit }: { throttled: boolean }) => {
      wasThrottled = hitLimit;
    };

    try {
      const items =
        searchMode === 'food'
          ? await searchFoodItems(text, 10, { onStatus })
          : await searchRecipes(text, 15, { onStatus });
      if (latestSearchRequestRef.current !== requestId) return;

      if (!items.length && wasThrottled) {
        setResults([]);
        setThrottled(true);
        setScreen('notfound');
        return;
      }

      const ranked = (items ?? [])
        .map((item: any) => ({ ...item, matchScore: matchPercent(text, item?.title ?? '') }))
        .sort((a: any, b: any) => b.matchScore - a.matchScore);

      setResults(ranked);
      setScreen(ranked.length ? 'results' : 'notfound');
    } catch {
      if (latestSearchRequestRef.current !== requestId) return;
      setResults([]);
      setSearchFailed(true);
      setScreen('notfound');
    }
  }, []);

  // One utterance = one search: only a FINAL result triggers a search call.
  // Interim partials flicker (beam search) and would spam the backend.
  useEffect(() => {
    if (screen !== 'listening' || state !== 'finished') return;
    const text = finalTranscript.trim().slice(0, MAX_TRANSCRIPT_LENGTH);
    if (!text) return;
    setTranscript(text);
    void runSearch(text, mode);
  }, [screen, state, finalTranscript, mode, runSearch]);

  const beginListening = useCallback(
    (nextMode: VoiceSearchMode) => {
      setMode(nextMode);
      setTranscript('');
      setResults([]);
      setSearchFailed(false);
      setThrottled(false);
      latestSearchRequestRef.current += 1; // abandon any in-flight search
      setScreen('listening');
      void start();
    },
    [start]
  );

  const handleClose = useCallback(() => {
    reset(); // stops the recognizer — never leave the mic running behind a closed modal
    latestSearchRequestRef.current += 1;
    setScreen('chooser');
    setTranscript('');
    setResults([]);
    setSearchFailed(false);
    setThrottled(false);
    setPendingItem(null);
    setAddingId(null);
    setStatusOverlay(null);
    onClose();
  }, [onClose, reset]);

  const openFoodDetail = useCallback(
    (item: any) => {
      handleClose();
      router.push({
        pathname: '/(tabs)/meal/comboDetail',
        params: {
          itemData: JSON.stringify(item),
          selectedDate: formatLocalYYYYMMDD(new Date()),
        },
      });
    },
    [handleClose, router]
  );

  const openRecipeDetail = useCallback(
    (item: any) => {
      handleClose();
      router.push({
        pathname: '/(tabs)/meal/recipedetail',
        params: {
          id: String(item?.id ?? ''),
          source: 'fatsecret',
          previewImage: item?.image || '',
        },
      });
    },
    [handleClose, router]
  );

  const addToMealLog = useCallback(
    async (item: any, mealType: MealType, servings: number) => {
      if (!userId) {
        flashStatus('error', 'Sign-in required', 'You must be logged in to save meals.');
        return;
      }

      const itemId = String(item?.id ?? '');
      setAddingId(itemId);
      const date = formatLocalYYYYMMDD(new Date());

      try {
        // Log exactly the serving the card showed — its macros, serving_id and
        // serving_description, which foods.search already returns. Re-resolving via
        // food.get would risk logging a DIFFERENT serving than the user tapped:
        // the backend's pickBestServing scores richness*2 but the expected-calorie
        // match only *1.5, so a richer serving outranks an exact calorie match.
        //
        // calories/protein/carbs/fats are stored as the TOTAL and `servings` as the
        // multiplier; meal summary derives per-serving as total / servings, so the
        // macros must be scaled here (ERROR_LOG Error 061).
        const servingText = String(item?.serving_description ?? '').trim();
        const payload = {
          clerkId: userId,
          date,
          mealType,
          foodName: item?.title || 'Unknown item',
          calories: toNumber(item?.calories) * servings,
          protein: toNumber(item?.protein) * servings,
          carbs: toNumber(item?.carbs ?? item?.carbohydrate) * servings,
          fats: toNumber(item?.fats ?? item?.fat) * servings,
          image: item?.image || '',
          externalId: itemId,
          source: mode === 'food' ? 'fatsecret_food' : 'fatsecret_recipe',
          servingId: String(item?.serving_id ?? ''),
          servings,
          servingDescription:
            servings === 1 ? servingText || '1 serving' : `${formatServings(servings)} servings`,
          nutrients: {},
        };

        const response = await authedFetch('/api/meals/add', {
          method: 'POST',
          getToken,
          clerkId: userId,
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Failed to save meal');

        markMealsSummaryDirty(userId, date);

        const slot = mealType[0].toUpperCase() + mealType.slice(1);
        if (body?.exceededLimit) {
          flashStatus('success', 'Added — heads up', `${slot}: you crossed your daily calorie goal`, 'eating');
        } else if (body?.reachedTarget) {
          flashStatus('success', 'Added — nice!', `${slot}: you reached your daily target`, 'happy');
        } else {
          flashStatus('success', 'Added to your meal plan', slot, 'eating');
        }
      } catch {
        flashStatus('error', 'Could not add', `We couldn't add this ${modeWord}. Please try again.`);
      } finally {
        setAddingId(null);
      }
    },
    [userId, getToken, mode, modeWord, flashStatus]
  );

  const openMealPicker = useCallback((item: any) => {
    setLogServings(1); // default to one serving each time the picker opens
    setPendingItem(item);
  }, []);

  const liveTranscript = interimTranscript || finalTranscript;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      {screen === 'chooser' && (
        <View style={styles.chooserOverlay}>
          <TouchableOpacity style={styles.chooserDismissArea} activeOpacity={1} onPress={handleClose} />
          <View style={styles.chooserSheet}>
            <View style={styles.grip} />
            <Text style={styles.chooserTitle}>What are you searching for?</Text>
            <Text style={styles.chooserSubtitle}>Pick one, then just say the name out loud</Text>

            <View style={styles.optionRow}>
              <TouchableOpacity style={styles.optionCard} activeOpacity={0.8} onPress={() => beginListening('food')}>
                <View style={[styles.optionIconTile, { backgroundColor: '#E7F1FF' }]}>
                  <Ionicons name="restaurant-outline" size={30} color="#007BFF" />
                </View>
                <Text style={styles.optionTitle}>Food</Text>
                <Text style={styles.optionSubtitle}>Single items &amp; ingredients</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.optionCard} activeOpacity={0.8} onPress={() => beginListening('recipe')}>
                <View style={[styles.optionIconTile, { backgroundColor: '#FFF2E0' }]}>
                  <Ionicons name="book-outline" size={30} color="#FF9500" />
                </View>
                <Text style={styles.optionTitle}>Recipe</Text>
                <Text style={styles.optionSubtitle}>Full meals with steps</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {screen === 'listening' && (
        <FadeIn style={styles.fill}>
          <LinearGradient colors={['#F4F8FE', '#E9F1FB']} style={styles.fill}>
            {error ? (
              <View style={styles.listenErrorWrap}>
                <Ionicons
                  name={error.type === 'permission-denied' ? 'mic-off-outline' : 'ear-outline'}
                  size={44}
                  color={PAL.listenSub}
                />
                <Text style={styles.listenErrorTitle}>
                  {error.type === 'permission-denied' ? 'Microphone is off' : "Didn't catch that"}
                </Text>
                <Text style={styles.listenErrorMessage}>{error.message}</Text>

                {error.type === 'permission-denied' && !error.canAskAgain ? (
                  <TouchableOpacity style={styles.primaryButton} onPress={() => void Linking.openSettings()}>
                    <Text style={styles.primaryButtonText}>Open Settings</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.primaryButton} onPress={() => void start()}>
                    <Ionicons name="mic-outline" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>Try again</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={[styles.listenHeader, { marginTop: insets.top + 44 }]}>
                  <View style={styles.listenPill}>
                    <RecordingDot />
                    <Text style={styles.listenPillText}>LISTENING · {mode === 'food' ? 'FOOD' : 'RECIPE'}</Text>
                  </View>
                  <Text style={styles.listenHeadline}>Say a {modeWord} name</Text>
                </View>

                <View style={styles.listenBody}>
                  <View style={styles.waveWrap}>
                    <Waveform />
                  </View>
                  <Text style={styles.listenTranscript} numberOfLines={2}>
                    {liveTranscript ? `“${liveTranscript}”` : ' '}
                  </Text>
                  <Text style={styles.listenHint}>
                    {state === 'listening' ? 'Hearing you clearly…' : 'Starting microphone…'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.stopButton, { marginBottom: insets.bottom + 40 }]}
                  onPress={stop}
                  accessibilityRole="button"
                  accessibilityLabel="Stop listening"
                >
                  <View style={styles.stopSquare} />
                </TouchableOpacity>
              </>
            )}
          </LinearGradient>
        </FadeIn>
      )}

      {screen === 'searching' && (
        <FadeIn duration={200} style={[styles.searchWrap, { paddingTop: insets.top + 24 }]}>
          <View style={styles.searchHeaderRow}>
            <Ionicons name="search-outline" size={20} color={PAL.accent} />
            <Text style={styles.searchTitle} numberOfLines={1}>
              Searching “{transcript}”
            </Text>
            {/* Not in the design: without it a slow or hung search would trap the user,
                since a full-screen Modal has no dismiss gesture on iOS. */}
            <TouchableOpacity style={styles.iconClose} onPress={handleClose} accessibilityLabel="Close">
              <Ionicons name="close" size={16} color={PAL.searchSub} />
            </TouchableOpacity>
          </View>
          <Text style={styles.searchSubtitle}>Matching against the nutrition database…</Text>

          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <ShimmerBlock style={styles.skeletonThumb} />
              <View style={styles.fill}>
                <ShimmerBlock style={styles.skeletonLineLg} />
                <ShimmerBlock style={styles.skeletonLineSm} />
                <View style={styles.skeletonPillRow}>
                  <ShimmerBlock style={styles.skeletonPill} />
                  <ShimmerBlock style={styles.skeletonPill} />
                  <ShimmerBlock style={styles.skeletonPill} />
                </View>
              </View>
            </View>
          ))}
        </FadeIn>
      )}

      {screen === 'results' && (
        <View style={styles.resultsOverlay}>
          <TouchableOpacity style={styles.resultsDismissArea} activeOpacity={1} onPress={handleClose} />
          <View style={styles.resultsSheet}>
            <View style={styles.resultsHeader}>
              <View style={styles.grip} />
              <View style={styles.resultsHeaderRow}>
                <View style={styles.fill}>
                  {/* The #1 quality lever: recognition mishears food words ("pho" -> "fur"),
                      so the heard text stays editable and re-runs the search on submit. */}
                  <View style={styles.heardRow}>
                    <Text style={styles.heardLabel}>HEARD</Text>
                    <TextInput
                      style={styles.heardInput}
                      value={transcript}
                      onChangeText={setTranscript}
                      onSubmitEditing={() => void runSearch(transcript, mode)}
                      returnKeyType="search"
                      maxLength={MAX_TRANSCRIPT_LENGTH}
                      selectTextOnFocus
                      accessibilityLabel="Edit what was heard and search again"
                    />
                    <Ionicons name="pencil" size={12} color={PAL.accent} />
                  </View>
                  <Text style={styles.resultsCount}>
                    {results.length} {modeWord} {results.length === 1 ? 'match' : 'matches'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.iconClose} onPress={handleClose} accessibilityLabel="Close">
                  <Ionicons name="close" size={16} color={PAL.sub} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.resultsList} keyboardShouldPersistTaps="handled">
              {results.map((item, index) => {
                const meta = confMeta(item.matchScore);
                const itemId = String(item?.id ?? index);
                return (
                  <View key={itemId} style={styles.resultCard}>
                    <View style={styles.resultTopRow}>
                      {item?.image ? (
                        <Image source={{ uri: item.image }} style={styles.resultImage} />
                      ) : (
                        <View style={[styles.resultImage, styles.resultImageFallback]}>
                          <Ionicons
                            name={mode === 'food' ? 'restaurant-outline' : 'book-outline'}
                            size={22}
                            color="#9CA3AF"
                          />
                        </View>
                      )}

                      <View style={styles.fill}>
                        <View style={styles.resultTitleRow}>
                          <Text style={styles.resultTitle}>{item?.title || 'Untitled'}</Text>
                          <View style={[styles.confBadge, { backgroundColor: meta.bg }]}>
                            <View style={[styles.confDot, { backgroundColor: meta.color }]} />
                            <Text style={[styles.confText, { color: meta.color }]}>{item.matchScore}%</Text>
                          </View>
                        </View>
                        <Text style={styles.resultServing} numberOfLines={1}>
                          {buildServingText(item, mode)}
                        </Text>
                        <View style={styles.macroRow}>
                          <View style={[styles.macroPill, { backgroundColor: '#E7F1FF' }]}>
                            <Text style={[styles.macroText, { color: '#007BFF' }]}>P {formatMacro(item?.protein)}g</Text>
                          </View>
                          <View style={[styles.macroPill, { backgroundColor: '#FFF2E0' }]}>
                            <Text style={[styles.macroText, { color: '#E67E00' }]}>C {formatMacro(item?.carbs)}g</Text>
                          </View>
                          <View style={[styles.macroPill, { backgroundColor: '#FDE8E8' }]}>
                            <Text style={[styles.macroText, { color: '#EF4444' }]}>F {formatMacro(item?.fats)}g</Text>
                          </View>
                          <View style={[styles.macroPill, { backgroundColor: '#DFF7EF' }]}>
                            <Text style={[styles.macroText, { color: '#0E9F6E' }]}>
                              {Math.round(toNumber(item?.calories))} cal
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.ghostButton}
                        onPress={() => (mode === 'food' ? openFoodDetail(item) : openRecipeDetail(item))}
                      >
                        <Text style={styles.ghostButtonText}>
                          {mode === 'food' ? 'View food detail' : 'View recipe'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.solidButton}
                        disabled={addingId === itemId}
                        onPress={() => openMealPicker(item)}
                      >
                        {addingId === itemId ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.solidButtonText}>Add to meal plan</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* In-modal overlay, not a nested <Modal> — see the file header note. */}
          {pendingItem && (
            <View style={styles.pickerOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setPendingItem(null)}
              />
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerHeading}>Add to meal log</Text>

                <Text style={styles.pickerLabel}>How many servings?</Text>
                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={styles.stepperMinus}
                    onPress={() => setLogServings((s) => stepServings(s, -0.5))}
                    accessibilityLabel="Fewer servings"
                  >
                    <Ionicons name="remove" size={22} color="#111827" />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{formatServings(logServings)}</Text>
                  <TouchableOpacity
                    style={styles.stepperPlus}
                    onPress={() => setLogServings((s) => stepServings(s, 0.5))}
                    accessibilityLabel="More servings"
                  >
                    <Ionicons name="add" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.stepperPreview}>
                  = {Math.round(toNumber(pendingItem?.calories) * logServings)} kcal
                </Text>

                <Text style={styles.pickerLabel}>When are you eating this?</Text>
                {MEAL_TYPES.map((meal) => (
                  <TouchableOpacity
                    key={meal}
                    style={styles.pickerOption}
                    onPress={() => {
                      const item = pendingItem;
                      const servings = logServings;
                      setPendingItem(null);
                      void addToMealLog(item, meal, servings);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{meal[0].toUpperCase() + meal.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.cancelButton} onPress={() => setPendingItem(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <InlineStatusOverlay
            visible={!!statusOverlay}
            variant={statusOverlay?.variant ?? 'success'}
            title={statusOverlay?.title ?? ''}
            message={statusOverlay?.message ?? ''}
            pip={statusOverlay?.pip}
            onHide={() => setStatusOverlay(null)}
          />
        </View>
      )}

      {screen === 'notfound' && (
        <FadeIn style={[styles.searchWrap, styles.centered]}>
          <Text style={styles.listenErrorTitle}>
            {throttled
              ? 'Too many requests'
              : searchFailed
              ? "Couldn't search right now"
              : `No match for “${transcript}”`}
          </Text>
          <Text style={styles.listenErrorMessage}>
            {throttled
              ? "You're searching a bit fast — wait a moment and try again."
              : searchFailed
              ? 'Check your connection and try again.'
              : `We couldn't find that ${modeWord} in the database.`}
          </Text>
          {/* The full designed not-found screen (mascot, Try voice again, Add Food
              Manually, Back to home) is Phase 6. */}
          <TouchableOpacity style={styles.primaryButton} onPress={() => beginListening(mode)}>
            <Ionicons name="mic-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Try voice again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelText}>Close</Text>
          </TouchableOpacity>
        </FadeIn>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  /* chooser */
  chooserOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: PAL.overlay },
  chooserDismissArea: { flex: 1 },
  chooserSheet: {
    backgroundColor: PAL.sheetBg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 40,
  },
  grip: { width: 44, height: 5, borderRadius: 999, backgroundColor: PAL.grip, alignSelf: 'center', marginBottom: 22 },
  chooserTitle: { fontSize: 22, fontWeight: '800', color: PAL.txt, textAlign: 'center', marginBottom: 6 },
  chooserSubtitle: { fontSize: 14, color: PAL.sub, textAlign: 'center', marginBottom: 26 },
  optionRow: { flexDirection: 'row', gap: 14 },
  optionCard: {
    flex: 1,
    backgroundColor: PAL.optBg,
    borderWidth: 1.5,
    borderColor: PAL.optLine,
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 12,
  },
  optionIconTile: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 17, fontWeight: '800', color: PAL.txt },
  optionSubtitle: { fontSize: 12, color: PAL.sub, textAlign: 'center', lineHeight: 16 },
  cancelButton: { marginTop: 18, width: '100%', alignItems: 'center', paddingVertical: 6 },
  cancelText: { fontSize: 14, fontWeight: '700', color: PAL.sub },

  /* listening */
  listenHeader: { alignItems: 'center' },
  listenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: PAL.pillBg,
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: 999,
    marginBottom: 8,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PAL.danger },
  listenPillText: { fontSize: 12, fontWeight: '800', color: PAL.listenSub, letterSpacing: 0.5 },
  listenHeadline: { fontSize: 26, fontWeight: '800', color: PAL.listenTxt },
  listenBody: { flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%' },
  waveWrap: { width: '78%' },
  waveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 92 },
  waveBar: { width: 6, height: 66, borderRadius: 4, backgroundColor: PAL.accent },
  listenTranscript: {
    marginTop: 38,
    fontSize: 30,
    fontWeight: '800',
    color: PAL.listenTxt,
    minHeight: 38,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  listenHint: { marginTop: 8, fontSize: 13, color: PAL.listenSub },
  stopButton: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: PAL.stopBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  stopSquare: { width: 20, height: 20, borderRadius: 5, backgroundColor: PAL.danger },
  listenErrorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  listenErrorTitle: { fontSize: 23, fontWeight: '800', color: PAL.listenTxt, marginTop: 10, textAlign: 'center' },
  listenErrorMessage: { fontSize: 14, color: PAL.listenSub, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  primaryButton: {
    marginTop: 26,
    width: '100%',
    backgroundColor: PAL.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  /* searching */
  searchWrap: { flex: 1, backgroundColor: PAL.searchBg, paddingHorizontal: 20 },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  searchTitle: { flex: 1, fontSize: 19, fontWeight: '800', color: PAL.searchTxt },
  searchSubtitle: { fontSize: 13, color: PAL.searchSub, marginBottom: 22 },
  iconClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PAL.closeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonCard: {
    backgroundColor: PAL.cardBg,
    borderWidth: 1,
    borderColor: PAL.cardLine,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  shimmerBase: { backgroundColor: PAL.shim1, overflow: 'hidden' },
  skeletonThumb: { width: 54, height: 54, borderRadius: 14 },
  skeletonLineLg: { height: 14, width: '65%', borderRadius: 6, marginBottom: 9 },
  skeletonLineSm: { height: 11, width: '40%', borderRadius: 6, marginBottom: 12 },
  skeletonPillRow: { flexDirection: 'row', gap: 7 },
  skeletonPill: { height: 20, width: 46, borderRadius: 999 },

  /* results */
  resultsOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: PAL.overlay },
  resultsDismissArea: { height: 44 },
  resultsSheet: {
    flex: 1,
    backgroundColor: PAL.resBg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  resultsHeader: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: PAL.resLine },
  resultsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heardLabel: { fontSize: 12, fontWeight: '700', color: PAL.accent, letterSpacing: 0.4 },
  heardInput: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: PAL.accent,
    letterSpacing: 0.4,
    padding: 0,
    minWidth: 60,
  },
  resultsCount: { fontSize: 20, fontWeight: '800', color: PAL.resTxt, marginTop: 2 },
  resultsList: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28 },
  resultCard: {
    backgroundColor: PAL.cardBg,
    borderWidth: 1,
    borderColor: PAL.cardLine,
    borderRadius: 20,
    padding: 14,
    marginBottom: 14,
  },
  resultTopRow: { flexDirection: 'row', gap: 13 },
  resultImage: { width: 62, height: 62, borderRadius: 15, backgroundColor: '#e9eef5' },
  resultImageFallback: { alignItems: 'center', justifyContent: 'center' },
  resultTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  resultTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: PAL.cardTxt, lineHeight: 20 },
  confBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  confText: { fontSize: 11, fontWeight: '800' },
  resultServing: { fontSize: 12, color: PAL.cardSub, marginTop: 3 },
  macroRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  macroPill: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  macroText: { fontSize: 11, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
  ghostButton: {
    flex: 1,
    backgroundColor: PAL.ghostBg,
    borderWidth: 1.5,
    borderColor: PAL.accent,
    borderRadius: 13,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: { color: PAL.accent, fontSize: 13, fontWeight: '800' },
  solidButton: {
    flex: 1,
    backgroundColor: PAL.accent,
    borderRadius: 13,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  /* meal picker overlay */
  pickerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: PAL.overlay, justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#F3F4F6',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 34,
  },
  pickerHeading: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 14 },
  pickerLabel: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 12 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginBottom: 4 },
  stepperMinus: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepperPlus: { width: 44, height: 44, borderRadius: 22, backgroundColor: PAL.accent, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 22, fontWeight: '800', color: '#111827', minWidth: 46, textAlign: 'center' },
  stepperPreview: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 22 },
  pickerOption: {
    width: '100%',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 12,
  },
  pickerOptionText: { fontWeight: '700', color: '#374151', fontSize: 16 },
});

export default VoiceSearchModal;
