/**
 * PIP ACTION STATUS CARD
 *
 * The one card every meal-log commit shows, from the tap to the acknowledgement.
 * It is mounted ONCE per action and morphs in place: Pip thinks while the
 * request is out, then eases into the outcome pose; the copy swaps; and the
 * button, present from the first frame as a disabled "Saving…" pill, wakes into
 * Confirm only once Pip has finished reacting. There is never a second card, a
 * second fade-in, or a swap between two surfaces.
 *
 * Design: claude_memory/loading redesign/pip-loading-status.html (D5, D6).
 * Plan:   claude_memory/loading redesign/LOADING_REDESIGN_PLAN.md
 *
 * STRUCTURAL RULES (each one has bitten before):
 *  - A plain absolute-fill View, never a nested React Native <Modal>. Stacking
 *    a second Modal over an open one silently fails or freezes touch on iOS
 *    (ERROR_LOG Errors 019, 055). Inside AddFoodModal this renders in the
 *    modal's own content, exactly like the ActivityIndicator card it replaces.
 *  - One PipBird, never remounted. Its `state` prop changes and the rig's own
 *    ease-through-idle IS the thinking-to-outcome morph. Keying it on phase
 *    would cut instead of easing.
 *  - The keyboard is dismissed on show: it is an OS layer above everything and
 *    covers the button (ERROR_LOG Error 075; same fix as InlineStatusOverlay).
 *  - Pip is decorative and hidden from the screen reader so the title speaks
 *    first; otherwise VoiceOver reads "Pip is happy" before the outcome.
 *  - Classic Animated + useNativeDriver for the card's own fades, never
 *    reanimated worklets (babel sets worklets:false; ERROR_LOG Error 007).
 *
 * Geometry, backdrop and type are copied from InlineStatusOverlay.tsx and
 * confirmationTypography.ts so this reads as the same family of card. That
 * component is deliberately NOT modified: the password flows depend on it.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import PipBird, { type PipState } from './PipBird';
import { confirmationType } from '../confirmationTypography';
import {
  resolveMealLogFailure,
  type MealLogContext,
  type MealLogOutcome,
  type MealLogResult,
} from '../../services/mealLogOutcome';

/* ---------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------- */

export type PipActionStatus =
  | { phase: 'idle' }
  // Request in flight. Pip: loading. Button: disabled "Saving…" with spinner.
  | { phase: 'loading'; operationId: number; title: string; message: string }
  // Request finished. Pip reacting, copy swapped. Button: disabled, already
  // labelled with the outcome's action.
  | { phase: 'settled'; operationId: number; result: MealLogResult }
  // Pip finished. Button enabled; the card waits for acknowledgement.
  | { phase: 'ready'; operationId: number; result: MealLogResult };

/** Never show a fast response as a flash (D3). The request itself is never delayed. */
export const PIP_ACTION_MIN_LOADING_MS = 800;

/* ---------------------------------------------------------------------------
 * Hook
 * ------------------------------------------------------------------------- */

export type PipActionRunOptions = {
  loading: { title: string; message: string };
  context: MealLogContext;
  /** The whole commit: lookup, save, cache invalidation. Resolves with the outcome. */
  task: () => Promise<MealLogOutcome>;
  /** Called when the user taps the action on the finished card. */
  onDismiss?: (result: MealLogResult) => void;
};

export type PipActionStatusController = {
  status: PipActionStatus;
  /** True from the tap until the user acknowledges the outcome. */
  isBusy: boolean;
  /** Guarded: a second call while busy is ignored and returns null. */
  run: (options: PipActionRunOptions) => Promise<MealLogResult | null>;
  /** Props for <PipActionStatusCard>. Spread them; do not wire the card by hand. */
  cardProps: {
    status: PipActionStatus;
    onPipSettled: () => void;
    onConfirm: () => void;
  };
};

/**
 * Owns the lifecycle so a call site cannot forget any of it: the in-flight
 * guard before the first await, the loading floor, the stale-completion
 * check, the settled→ready gate, and timer cleanup on unmount (Pip work log
 * 044: refocus must never replay stale work).
 */
export function usePipActionStatus(): PipActionStatusController {
  const [status, setStatus] = useState<PipActionStatus>({ phase: 'idle' });
  const statusRef = useRef(status);
  const operationRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismissRef = useRef<PipActionRunOptions['onDismiss']>(undefined);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const later = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const run = useCallback(
    async (options: PipActionRunOptions): Promise<MealLogResult | null> => {
      // Guard BEFORE any await (ERROR_LOG Error 071): a second tap during the
      // commit must never reach the network.
      if (statusRef.current.phase !== 'idle') return null;

      const operationId = ++operationRef.current;
      const isCurrent = () => operationRef.current === operationId;
      dismissRef.current = options.onDismiss;

      const next: PipActionStatus = { phase: 'loading', operationId, ...options.loading };
      statusRef.current = next;
      setStatus(next);

      const startedAt = Date.now();
      let result: MealLogResult;
      try {
        result = await options.task();
      } catch (error) {
        result = resolveMealLogFailure(error, options.context);
      }

      if (!isCurrent()) return result;

      // Symmetric floor: success and failure both wait out the remainder so a
      // fast reply cannot flash the card (D3, and the readability lesson of
      // Error 018). The network work above was never held up.
      const remaining = Math.max(0, PIP_ACTION_MIN_LOADING_MS - (Date.now() - startedAt));
      await new Promise<void>((resolve) => later(remaining, resolve));
      if (!isCurrent()) return result;

      const settled: PipActionStatus = { phase: 'settled', operationId, result };
      statusRef.current = settled;
      setStatus(settled);

      // Hard fallback for the settled→ready gate. The card normally advances
      // it from PipBird's onAnimationComplete or its own short beat; this only
      // exists so the button can never stay disabled forever.
      later(3500, () => {
        if (!isCurrent()) return;
        if (statusRef.current.phase !== 'settled') return;
        const ready: PipActionStatus = { phase: 'ready', operationId, result };
        statusRef.current = ready;
        setStatus(ready);
      });

      return result;
    },
    [later]
  );

  const onPipSettled = useCallback(() => {
    const current = statusRef.current;
    if (current.phase !== 'settled') return;
    const ready: PipActionStatus = { phase: 'ready', operationId: current.operationId, result: current.result };
    statusRef.current = ready;
    setStatus(ready);
  }, []);

  const onConfirm = useCallback(() => {
    const current = statusRef.current;
    // The disabled look also blocks touches, but this is the real defence:
    // nothing dismisses the card before Pip is done.
    if (current.phase !== 'ready') return;
    clearTimers();
    const idle: PipActionStatus = { phase: 'idle' };
    statusRef.current = idle;
    setStatus(idle);
    const onDismiss = dismissRef.current;
    dismissRef.current = undefined;
    onDismiss?.(current.result);
  }, [clearTimers]);

  return {
    status,
    isBusy: status.phase !== 'idle',
    run,
    cardProps: { status, onPipSettled, onConfirm },
  };
}

/* ---------------------------------------------------------------------------
 * Card
 * ------------------------------------------------------------------------- */

type PipActionStatusCardProps = PipActionStatusController['cardProps'] & {
  /**
   * Extra overlay style, for a host that needs to win a layer order. AddFoodModal
   * sits its saving overlay at zIndex 10000, above its in-modal alert.
   */
  style?: StyleProp<ViewStyle>;
};

const PAL = {
  // Matches customAlert.tsx / sucessmodal.tsx / InlineStatusOverlay's bg-black/50.
  backdrop: 'rgba(0,0,0,0.5)',
  primary: '#007BFF',
  // Tailwind blue-300: the disabled primary pill AddFoodModal already uses on a
  // busy Add button (`bg-blue-300` + small white ActivityIndicator).
  primaryDisabled: '#93C5FD',
};

/** Beat before the button wakes for poses that have no one-shot to wait for. */
const SETTLE_BEAT_MS = 600;
/** Reduce Motion plays nothing, so wake the button after a readable pause. */
const REDUCE_MOTION_BEAT_MS = 400;
/** Local safety net if a one-shot never reports back (the hook has its own). */
const ONE_SHOT_FALLBACK_MS = 3000;

const isOneShot = (pip: PipState) => pip === 'eating' || pip === 'happy';

export function PipActionStatusCard({ status, onPipSettled, onConfirm, style }: PipActionStatusCardProps) {
  const visible = status.phase !== 'idle';
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const copyOpacity = useRef(new Animated.Value(1)).current;
  const wake = useRef(new Animated.Value(0)).current;
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // Entrance. Runs once per action because the card mounts once per action.
  useEffect(() => {
    if (!visible) return;
    Keyboard.dismiss();
    overlayOpacity.setValue(0);
    wake.setValue(0);
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [visible, overlayOpacity, wake]);

  // Copy swap: fade the new title/message in over the same slot.
  const phase = status.phase;
  useEffect(() => {
    if (phase !== 'settled') return;
    copyOpacity.setValue(0);
    Animated.timing(copyOpacity, {
      toValue: 1,
      duration: reduceMotion ? 0 : 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [phase, copyOpacity, reduceMotion]);

  // Button wake: blue-300 → primary as the phase reaches ready.
  useEffect(() => {
    Animated.timing(wake, {
      toValue: phase === 'ready' ? 1 : 0,
      duration: reduceMotion ? 0 : 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false, // colour interpolation cannot run on the native driver
    }).start();
  }, [phase, wake, reduceMotion]);

  // settled → ready gate for the poses that are not one-shots, and for Reduce
  // Motion where PipBird animates nothing and so never reports completion.
  const settledPip = status.phase === 'settled' ? status.result.pip : null;
  useEffect(() => {
    if (gateTimer.current) {
      clearTimeout(gateTimer.current);
      gateTimer.current = null;
    }
    if (!settledPip) return;
    const wait = reduceMotion
      ? REDUCE_MOTION_BEAT_MS
      : isOneShot(settledPip)
        ? ONE_SHOT_FALLBACK_MS
        : SETTLE_BEAT_MS;
    gateTimer.current = setTimeout(() => {
      gateTimer.current = null;
      onPipSettled();
    }, wait);
    return () => {
      if (gateTimer.current) clearTimeout(gateTimer.current);
      gateTimer.current = null;
    };
  }, [settledPip, reduceMotion, onPipSettled]);

  // Screen readers hear the status and then the outcome, in that order.
  useEffect(() => {
    if (status.phase === 'loading') AccessibilityInfo.announceForAccessibility(status.title);
    if (status.phase === 'settled') AccessibilityInfo.announceForAccessibility(status.result.title);
  }, [status]);

  const handleAnimationComplete = useCallback(() => {
    // Only meaningful while settled; a late callback after Confirm is ignored
    // by the hook's phase check.
    onPipSettled();
  }, [onPipSettled]);

  if (!visible) return null;

  const pip: PipState = status.phase === 'loading' ? 'loading' : status.result.pip;
  const title = status.phase === 'loading' ? status.title : status.result.title;
  const message = status.phase === 'loading' ? status.message : status.result.message;
  const buttonLabel = status.phase === 'loading' ? 'Saving…' : status.result.actionLabel;
  const buttonEnabled = status.phase === 'ready';
  const buttonBackground = wake.interpolate({
    inputRange: [0, 1],
    outputRange: [PAL.primaryDisabled, PAL.primary],
  });

  return (
    // pointerEvents "auto": the overlay is the touch shield. It swallows the
    // taps the host screen forgot to disable (other rows, the footer, close).
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }, style]}>
      <View style={styles.card}>
        {/* Hidden from screen readers: PipBird labels itself "Pip is <state>",
            which VoiceOver would read BEFORE the outcome. The title leads. */}
        <View
          style={styles.pipSlot}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <PipBird size={92} state={pip} onAnimationComplete={handleAnimationComplete} />
        </View>

        <Animated.View style={[styles.copy, { opacity: copyOpacity }]} accessibilityLiveRegion="polite">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </Animated.View>

        <TouchableOpacity
          onPress={onConfirm}
          disabled={!buttonEnabled}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          accessibilityState={{ disabled: !buttonEnabled, busy: status.phase === 'loading' }}
          activeOpacity={0.85}
          style={styles.buttonTouch}
        >
          <Animated.View style={[styles.button, { backgroundColor: buttonBackground }]}>
            {status.phase === 'loading' && <ActivityIndicator size="small" color="#fff" />}
            <Text style={styles.buttonText}>{buttonLabel}</Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PAL.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    zIndex: 50,
  },
  // InlineStatusOverlay's card, at a FIXED width: the copy swaps mid-action and
  // a min/max-width card would resize under the user's thumb.
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: 244,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  // Bottom-aligned so Pip stands on the card's baseline rather than floating.
  pipSlot: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  // Fixed minimum so a shorter outcome line cannot move the button.
  copy: {
    minHeight: 43,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  title: {
    ...confirmationType.titleCompact,
    marginBottom: 4,
  },
  message: confirmationType.messageCompact,
  buttonTouch: {
    marginTop: 12,
    alignSelf: 'stretch',
  },
  // Pill, per InlineStatusOverlay's primaryButton. Colour is animated on the
  // wrapping Animated.View, so it is deliberately absent here.
  button: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default PipActionStatusCard;
