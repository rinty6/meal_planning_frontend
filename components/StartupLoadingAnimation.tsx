import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

/**
 * Orbit Ring startup loading animation (design concept 1a).
 *
 * Visual layer only — it renders whatever startup state the parent (`app/index.tsx`)
 * is in. Two counter-rotating rings of food icons orbit the GoodHealthMate mascot
 * while auth + backend bootstrap run. On a real failure (`error` is set) the loop
 * fades, the mascot rises, and an error card slides up with Retry + Sign Out.
 *
 * IMPORTANT: built on React Native's classic `Animated` API with `useNativeDriver`.
 * Do NOT convert to react-native-reanimated worklets — the app's babel.config.js
 * disables the worklets plugin and New Architecture is off (see ERROR_LOG Error 007),
 * so worklet code would silently freeze or crash.
 */

const BRAND_BLUE = '#13519C';
const PRIMARY_BLUE = '#007BFF';
const CARD_NAVY = '#0B2149';
const CARD_GRAY = '#6B7280';

const SUPPORT_EMAIL = 'support@dreamingstudio.net';

type RingIcon = { src: ImageSourcePropType; angle: number };

// All 8 food icons in the app, split across the two rings (4 each, evenly spaced).
const INNER_RING: RingIcon[] = [
  { src: require('../assets/icons/coffee.png'), angle: 0 },
  { src: require('../assets/icons/salad.png'), angle: 90 },
  { src: require('../assets/icons/fish.png'), angle: 180 },
  { src: require('../assets/icons/rice.png'), angle: 270 },
];

const OUTER_RING: RingIcon[] = [
  { src: require('../assets/icons/fruit.png'), angle: 45 },
  { src: require('../assets/icons/steak.png'), angle: 135 },
  { src: require('../assets/icons/desert.png'), angle: 225 },
  { src: require('../assets/icons/raw_chicken.png'), angle: 315 },
];

const MASCOT = require('../assets/images/mascot_crop.png');

// Map the real startupPhase values from app/index.tsx to friendly, reassuring labels.
const mapPhaseToLabel = (phase: string): string => {
  if (phase.includes('profile')) return 'Loading your profile…';
  if (phase.includes('bootstrap') || phase.includes('account')) return 'Syncing your account…';
  if (phase.includes('Preparing') || phase.includes('dashboard') || phase.includes('Opening')) return 'Almost there…';
  return 'Signing you in…';
};

const MIN_LABEL_MS = 900; // keep each status label on screen long enough to read (Error E9)

type Props = {
  startupPhase: string;
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
};

/** A full-screen overlay that centers its single child on the exact middle of the screen. */
const CenterLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={styles.centerLayer} pointerEvents="none">
    {children}
  </View>
);

/**
 * One rotating ring of icons. A sized container rotates; each icon is placed at an explicit
 * (left/top) point on the circle. This is robust in RN — the earlier version chained nested
 * zero-size rotating views, which on-device collapsed most icons toward the center (only ~2
 * stayed visible). Each icon counter-rotates so it holds a fixed tilt equal to its mount angle
 * while orbiting (faithful to the design prototype).
 */
const Ring: React.FC<{
  icons: RingIcon[];
  radius: number;
  box: number;
  spinValue: Animated.Value;
  direction: 'cw' | 'ccw';
}> = ({ icons, radius, box, spinValue, direction }) => {
  const ringSize = radius * 2;
  const containerRotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: direction === 'cw' ? ['0deg', '360deg'] : ['0deg', '-360deg'],
  });
  return (
    <Animated.View style={{ width: ringSize, height: ringSize, transform: [{ rotate: containerRotate }] }}>
      {icons.map((icon, i) => {
        const rad = (icon.angle * Math.PI) / 180;
        const left = ringSize / 2 + radius * Math.cos(rad) - box / 2;
        const top = ringSize / 2 + radius * Math.sin(rad) - box / 2;
        // Cancel the container spin so the icon's absolute orientation stays constant (= mount angle).
        const counter = spinValue.interpolate({
          inputRange: [0, 1],
          outputRange:
            direction === 'cw'
              ? [`${icon.angle}deg`, `${icon.angle - 360}deg`]
              : [`${icon.angle}deg`, `${icon.angle + 360}deg`],
        });
        return (
          <Animated.View
            key={i}
            style={{ position: 'absolute', left, top, width: box, height: box, transform: [{ rotate: counter }] }}
          >
            <Image source={icon.src} style={[styles.ringIcon, { width: box, height: box }]} resizeMode="contain" />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
};

const StartupLoadingAnimation: React.FC<Props> = ({ startupPhase, error, onRetry, onSignOut }) => {
  const hasError = Boolean(error);

  // ── Continuous loop drivers (0 → 1, looped) ──────────────────────────────
  const innerSpin = useRef(new Animated.Value(0)).current; // inner ring, 18s CW
  const outerSpin = useRef(new Animated.Value(0)).current; // outer ring, 26s CCW
  const glow = useRef(new Animated.Value(0)).current; // center glow pulse, 4.5s
  const breathe = useRef(new Animated.Value(0)).current; // mascot breathing, 3.2s
  const barSweep = useRef(new Animated.Value(0)).current; // progress bar, 1.5s
  const wordFade = useRef(new Animated.Value(0)).current; // wordmark fade-in on mount

  // ── State drivers ────────────────────────────────────────────────────────
  const morph = useRef(new Animated.Value(0)).current; // 0 = loop, 1 = error morphed
  const cardIn = useRef(new Animated.Value(0)).current; // error card slide-up
  const statusFade = useRef(new Animated.Value(1)).current;

  const [displayLabel, setDisplayLabel] = useState(() => mapPhaseToLabel(startupPhase));
  const lastLabelChange = useRef(Date.now());

  // Start every looping animation once on mount.
  useEffect(() => {
    const spinLoop = (val: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.timing(val, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
      );

    const pulseLoop = (val: Animated.Value, halfDuration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: halfDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: halfDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );

    const animations = [
      spinLoop(innerSpin, 18000),
      spinLoop(outerSpin, 26000),
      pulseLoop(glow, 2250),
      pulseLoop(breathe, 1600),
      Animated.loop(
        Animated.timing(barSweep, {
          toValue: 1,
          duration: 1500,
          easing: Easing.bezier(0.65, 0, 0.35, 1),
          useNativeDriver: true,
        })
      ),
    ];

    animations.forEach((a) => a.start());
    Animated.timing(wordFade, { toValue: 1, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();

    return () => animations.forEach((a) => a.stop());
  }, [innerSpin, outerSpin, glow, breathe, barSweep, wordFade]);

  // Drive the morph → error card (and reverse on retry) whenever `error` toggles.
  useEffect(() => {
    if (hasError) {
      Animated.parallel([
        Animated.timing(morph, { toValue: 1, duration: 700, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
        Animated.timing(cardIn, { toValue: 1, duration: 550, delay: 220, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(morph, { toValue: 0, duration: 450, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(cardIn, { toValue: 0, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [hasError, morph, cardIn]);

  // Update the status label from the real phase, enforcing a minimum on-screen time.
  useEffect(() => {
    const target = mapPhaseToLabel(startupPhase);
    if (target === displayLabel) return;

    const elapsed = Date.now() - lastLabelChange.current;
    const wait = Math.max(0, MIN_LABEL_MS - elapsed);
    const timer = setTimeout(() => {
      Animated.timing(statusFade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setDisplayLabel(target);
        lastLabelChange.current = Date.now();
        Animated.timing(statusFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [startupPhase, displayLabel, statusFade]);

  const openSupport = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('GoodHealthMate startup error')}`;
    // Simulators / devices without a mail app reject this — never let it crash the screen (E15).
    Linking.openURL(url).catch(() => {});
  };

  // ── Interpolations ───────────────────────────────────────────────────────
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.5] });
  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const barTranslate = barSweep.interpolate({ inputRange: [0, 1], outputRange: [-BAR_FILL_W, BAR_TRACK_W * 1.2 + BAR_FILL_W] });

  const loopOpacity = morph.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 0, 0] });
  const heroTranslateY = morph.interpolate({ inputRange: [0, 1], outputRange: [0, -172] });
  const heroScale = morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.76] });
  const cardTranslateY = cardIn.interpolate({ inputRange: [0, 1], outputRange: [36, 0] });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Loop layer — everything that fades away when the error card appears */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: loopOpacity }]} pointerEvents="none">
        <CenterLayer>
          <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        </CenterLayer>
        <CenterLayer>
          <View style={styles.guideCircleInner} />
        </CenterLayer>
        <CenterLayer>
          <View style={styles.guideCircleOuter} />
        </CenterLayer>
        <CenterLayer>
          <Ring icons={INNER_RING} radius={96} box={50} spinValue={innerSpin} direction="cw" />
        </CenterLayer>
        <CenterLayer>
          <Ring icons={OUTER_RING} radius={152} box={44} spinValue={outerSpin} direction="ccw" />
        </CenterLayer>

        {/* Status block near the bottom */}
        <View style={styles.statusBlock} pointerEvents="none">
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, { transform: [{ translateX: barTranslate }] }]} />
          </View>
          <Animated.Text style={[styles.statusLabel, { opacity: statusFade }]}>{displayLabel}</Animated.Text>
        </View>
      </Animated.View>

      {/* Hero (mascot + wordmark) — stays visible, rises + shrinks on error */}
      <CenterLayer>
        <Animated.View style={{ alignItems: 'center', transform: [{ translateY: heroTranslateY }, { scale: heroScale }] }}>
          <Animated.Image source={MASCOT} style={[styles.mascot, { transform: [{ scale: breatheScale }] }]} />
          <Animated.Text style={[styles.wordmark, { opacity: wordFade, transform: [{ translateY: wordFade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
            GoodHealthMate
          </Animated.Text>
        </Animated.View>
      </CenterLayer>

      {/* Error card — mounted only on real failure */}
      {hasError && (
        <Animated.View style={[styles.card, { opacity: cardIn, transform: [{ translateY: cardTranslateY }] }]}>
          <Text style={styles.cardTitle}>{error}</Text>
          <Text style={styles.cardBody}>
            Contact{' '}
            <Text style={styles.cardLink} onPress={openSupport}>
              {SUPPORT_EMAIL}
            </Text>{' '}
            for more support
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.85}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signOutBtn} onPress={onSignOut} activeOpacity={0.85}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const BAR_TRACK_W = 172;
const BAR_FILL_W = Math.round(BAR_TRACK_W * 0.38); // ~65

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND_BLUE },
  centerLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  ringIcon: {
    // design icon drop-shadow: 0 8px 16px rgba(0,0,0,0.3)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  glow: { width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.22)' },
  guideCircleInner: { width: 192, height: 192, borderRadius: 96, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  guideCircleOuter: { width: 304, height: 304, borderRadius: 152, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },

  mascot: {
    width: 104,
    height: 104,
    borderRadius: 22,
    // icon/mascot drop-shadow (design: 0 8px 16px rgba(0,0,0,0.3))
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  wordmark: {
    marginTop: 14,
    color: '#fff',
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  statusBlock: { position: 'absolute', left: 36, right: 36, bottom: 96, alignItems: 'center' },
  barTrack: {
    width: BAR_TRACK_W,
    height: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  barFill: { width: BAR_FILL_W, height: 4, borderRadius: 9999, backgroundColor: '#fff' },
  statusLabel: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  card: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 64,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.28,
    shadowRadius: 48,
    elevation: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: CARD_NAVY, marginBottom: 6 },
  cardBody: { fontSize: 13.5, color: CARD_GRAY, lineHeight: 20, marginBottom: 18 },
  cardLink: { color: PRIMARY_BLUE, fontWeight: '700', textDecorationLine: 'underline' },
  retryBtn: { backgroundColor: PRIMARY_BLUE, borderRadius: 9999, paddingVertical: 13, alignItems: 'center' },
  retryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  signOutBtn: {
    marginTop: 12,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingVertical: 13,
    alignItems: 'center',
  },
  signOutText: { color: '#111827', fontSize: 15, fontWeight: '600' },
});

export default StartupLoadingAnimation;
