/**
 * PIP ACTION STATUS CARD
 *
 * The one card every meal-log commit shows, from the tap to the acknowledgement.
 * It is mounted ONCE per action and morphs in place: Pip thinks while the
 * request is out, then eases into the outcome pose; the copy swaps; and the
 * button, present from the first frame as a disabled "Saving…" pill, wakes into
 * Confirm one short beat after the save lands. Pip's reaction plays beside the
 * live button; it is a reward to watch, never a gate to wait through. There is
 * never a second card, a second fade-in, or a swap between two surfaces.
 *
 * Design: claude_memory/loading redesign/pip-loading-status.html (D5–D8).
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
 *  - The button follows the system, not the animation (D7). Nothing here
 *    reads PipBird's onAnimationComplete, so Reduce Motion needs no special
 *    case: the button wakes at the same moment whether Pip moves or not.
 *  - The keyboard is dismissed on show: it is an OS layer above everything and
 *    covers the button (ERROR_LOG Error 075; same fix as InlineStatusOverlay).
 *  - Pip is decorative and hidden from the screen reader so the title speaks
 *    first; otherwise VoiceOver reads "Pip is happy" before the outcome.
 *  - Classic Animated + useNativeDriver for the card's own fades, never
 *    reanimated worklets (babel sets worklets:false; ERROR_LOG Error 007).
 *
 * Geometry is SuccessModal's (sucessmodal.tsx), the card the app shows today,
 * so the swap is invisible at rest (D8). CustomAlert, SuccessModal and
 * InlineStatusOverlay are deliberately NOT modified.
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
import { dayProgressView } from '../../utils/dayProgress';
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
  // Request finished; copy swapped; Pip starting to react. Button: disabled for
  // one short beat, already labelled with the outcome's action.
  | { phase: 'settled'; operationId: number; result: MealLogResult }
  // Beat over. Button enabled; the card waits for acknowledgement while Pip's
  // one-shot plays beside it.
  | { phase: 'ready'; operationId: number; result: MealLogResult };

/** Never show a fast response as a flash (D3). The request itself is never delayed. */
export const PIP_ACTION_MIN_LOADING_MS = 800;
/**
 * How long the outcome sits on screen before the button becomes tappable (D7).
 * Only so the label is not changing under the thumb in the same frame it goes
 * live; the system's signal, not Pip's animation, is what wakes the button.
 */
export const PIP_ACTION_READY_BEAT_MS = 400;

/* ---------------------------------------------------------------------------
 * Hook
 * ------------------------------------------------------------------------- */

export type PipActionRunOptions = {
  loading: { title: string; message: string };
  context: MealLogContext;
  /**
   * One extra line under the message, shown only when the action SUCCEEDS.
   * The barcode report's thank-you uses it: the report is a side effect of the
   * save, so it gets a line on the same card rather than a card of its own
   * (checklist b5-06).
   */
  successNote?: string;
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
    onConfirm: () => void;
    note?: string;
  };
};

/**
 * Owns the lifecycle so a call site cannot forget any of it: the in-flight
 * guard before the first await, the loading floor, the stale-completion
 * check, the settled→ready beat, and timer cleanup on unmount (Pip work log
 * 044: refocus must never replay stale work).
 */
export function usePipActionStatus(): PipActionStatusController {
  const [status, setStatus] = useState<PipActionStatus>({ phase: 'idle' });
  const statusRef = useRef(status);
  const operationRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dismissRef = useRef<PipActionRunOptions['onDismiss']>(undefined);
  const [note, setNote] = useState<string | undefined>(undefined);

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
      setNote(options.successNote);

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

      // D7: the button wakes on the system's signal, one beat after the
      // outcome lands. Pip's one-shot is not consulted.
      later(PIP_ACTION_READY_BEAT_MS, () => {
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

  const onConfirm = useCallback(() => {
    const current = statusRef.current;
    // The disabled look also blocks touches, but this is the real defence:
    // nothing dismisses the card before the beat is over.
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
    cardProps: { status, onConfirm, note },
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
  // Matches customAlert.tsx / sucessmodal.tsx's bg-black/50.
  backdrop: 'rgba(0,0,0,0.5)',
  primary: '#007BFF',
  // Tailwind blue-300: the disabled primary pill AddFoodModal already uses on a
  // busy Add button (`bg-blue-300` + small white ActivityIndicator).
  primaryDisabled: '#93C5FD',
  // The app's secondary. Past the top of the tolerance band, not past the
  // number: see utils/dayProgress.ts.
  over: '#FF9500',
};

/** SuccessModal's Pip size (sucessmodal.tsx). */
const PIP_SIZE = 104;

export function PipActionStatusCard({ status, onConfirm, note, style }: PipActionStatusCardProps) {
  const visible = status.phase !== 'idle';
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const copyOpacity = useRef(new Animated.Value(1)).current;
  const wake = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  // Reduce Motion only shortens the card's own fades to 0 ms. The phase
  // timing is identical with it on or off (D7).
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
      duration: reduceMotion ? 0 : 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [visible, overlayOpacity, wake, reduceMotion]);

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

  // Screen readers hear the status and then the outcome, in that order.
  useEffect(() => {
    if (status.phase === 'loading') AccessibilityInfo.announceForAccessibility(status.title);
    if (status.phase === 'settled') AccessibilityInfo.announceForAccessibility(status.result.title);
  }, [status]);

  if (!visible) return null;

  const pip: PipState = status.phase === 'loading' ? 'loading' : status.result.pip;
  const title = status.phase === 'loading' ? status.title : status.result.title;
  const message = status.phase === 'loading' ? status.message : status.result.message;
  const buttonLabel = status.phase === 'loading' ? 'Saving…' : status.result.actionLabel;
  // The strip belongs to the outcome, so it appears with the copy swap and is
  // absent while saving: there is nothing true to say about the day yet.
  const day =
    status.phase !== 'loading' && status.result.kind === 'success' && status.result.day
      ? dayProgressView(status.result.day)
      : null;
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
          <PipBird size={PIP_SIZE} state={pip} />
        </View>

        <Animated.View style={[styles.copy, { opacity: copyOpacity }]} accessibilityLiveRegion="polite">
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {/* Success only. A note under a failure would read as consolation. */}
          {note && status.phase !== 'loading' && status.result.kind === 'success' ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}

          {/* Where the day stands, when the numbers are all there. Absent for a
              user with no goal rather than drawn against a guess. */}
          {day ? (
            <View style={styles.day}>
              <View style={styles.dayTrack}>
                <View
                  style={[
                    styles.dayFill,
                    { width: `${day.fillPercent}%`, backgroundColor: day.over ? PAL.over : PAL.primary },
                  ]}
                />
              </View>
              <View style={styles.dayLabels}>
                <Text style={styles.dayLabel} numberOfLines={1}>{day.left}</Text>
                <Text
                  style={[styles.dayLabel, day.over ? styles.dayLabelOver : null]}
                  numberOfLines={1}
                >
                  {day.right}
                </Text>
              </View>
            </View>
          ) : null}
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

// Every number below is sucessmodal.tsx's: `flex-1 bg-black/50 justify-center
// items-center px-6` around `bg-white w-full max-w-sm rounded-3xl p-6
// items-center shadow-2xl`, a 104 px Pip slot with mb-2, title mb-2, message
// mb-6, and `w-full py-3 rounded-full` with `text-lg font-bold`.
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PAL.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 50,
  },
  // `alignSelf: 'stretch'` rather than `width: '100%'`: the overlay's padding
  // sets the width, and a percentage against an indefinite parent does not
  // fill it (the same lesson as InlineStatusOverlay's cardWide).
  card: {
    alignSelf: 'stretch',
    maxWidth: 384,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    // Tailwind shadow-2xl.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 24,
  },
  // Bottom-aligned so Pip stands on the card's baseline rather than floating.
  pipSlot: {
    height: PIP_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  // Fixed minimum (one title line + one message line) so a shorter outcome
  // cannot move the button; a longer one grows the card, never the reverse.
  copy: {
    minHeight: 56,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    ...confirmationType.title,
    marginBottom: 8,
  },
  message: confirmationType.message,
  // The success-only note (b5-06). A quiet strip: it is information the user
  // did not ask for, under the sentence they did.
  note: {
    marginTop: 12,
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: '#F1F7F3',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  noteText: {
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
    color: '#3F7D55',
  },
  // The day strip (barcode checklist Phase 6). A measurement, so it is quiet:
  // a 6px track and two small labels, no heading and no icon.
  day: {
    marginTop: 14,
    alignSelf: 'stretch',
  },
  dayTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2F6',
    overflow: 'hidden',
  },
  dayFill: {
    height: 6,
    borderRadius: 999,
  },
  dayLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 10,
  },
  dayLabel: {
    fontSize: 11.5,
    color: '#6B7280',
    flexShrink: 1,
  },
  dayLabelOver: {
    color: '#B45309',
    fontWeight: '700',
  },
  buttonTouch: {
    alignSelf: 'stretch',
  },
  // Colour is animated on the wrapping Animated.View, so it is absent here.
  button: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '700',
  },
});

export default PipActionStatusCard;
