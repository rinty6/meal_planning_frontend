/**
 * INLINE STATUS OVERLAY
 *
 * A success/error confirmation card matching CustomAlert's success styling
 * (blue circle + checkmark, title, message) but rendered as a plain overlay
 * View instead of a top-level <Modal>. CustomAlert and SuccessModal both use
 * <Modal>, and a second Modal stacked on top of a Modal already on screen
 * behaves unreliably on iOS (see addfoodmodal.tsx's header note and
 * VoiceSearchModal.tsx's OVERLAYS note) — so any screen that shows this kind
 * of confirmation from inside another Modal must use this instead.
 *
 * Dims the screen behind it (matching CustomAlert/SuccessModal's backdrop) so
 * the message reads as focused, not a toast. Auto-dismisses after
 * `autoDismissMs` and calls onHide — the caller owns the visible/message
 * state, this component only owns its own fade animation.
 *
 * PERSISTENT MODE: pass `autoDismissMs={null}` and the card stays until the
 * user acts. There is no timer in that mode, so `onHide` never fires — supply
 * `primaryActionLabel` + `onPrimaryAction` and dismiss from the caller. Used by
 * the password flows for lockout and for a reset success that has to navigate.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PipBird, { type PipState } from './pip/PipBird';
import { confirmationType } from './confirmationTypography';

export type InlineStatusVariant = 'success' | 'error';

interface InlineStatusOverlayProps {
  visible: boolean;
  variant: InlineStatusVariant;
  title: string;
  message: string;
  /**
   * Optional Pip state shown in place of the icon circle. Left undefined, the
   * card keeps its original checkmark/cross, so existing callers are unaffected.
   */
  pip?: PipState;
  onHide: () => void;
  /**
   * Milliseconds before the card fades itself out, or `null` to stay put until
   * the user acts. Omitted keeps the original 2000ms.
   */
  autoDismissMs?: number | null;
  /** Pip's rendered size. The password overlays sit in a tighter card at 76. */
  pipSize?: number;
  /**
   * Both must be supplied for the button to render. In persistent mode this is
   * the only way out of the card.
   */
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  /**
   * Opt-in full-width card, matching PASSWORD_SCREENS.html (`.card { width:100% }`
   * inside a 22px-padded overlay). Off by default so VoiceSearchModal's cards
   * keep the shrink-to-fit size they ship with today — checklist §9 T6 requires
   * voice search to look unchanged.
   */
  wide?: boolean;
}

/**
 * Pip's one-shot states need longer on screen than the default dismiss:
 * eating runs 3 x 700ms and happy 2 x 950ms. Auto-dismissing at the old 2000ms
 * would cut the animation off mid-beat (the Error 018 "too fast to read" trap),
 * so a Pip card holds for the animation plus a beat to read the copy.
 */
const PIP_MIN_DISMISS_MS: Partial<Record<PipState, number>> = {
  eating: 3000,
  happy: 3000,
};

const PAL = {
  // Matches customAlert.tsx / sucessmodal.tsx's `bg-black/50` backdrop, so this
  // dims the results screen the same way the rest of the app dims behind a
  // confirmation — that's what makes the message read as "focused" rather than
  // a toast floating over untouched content.
  backdrop: 'rgba(0,0,0,0.5)',
  successBg: '#007BFF',
  errorBg: '#EF4444',
  // Title/message colours now come from confirmationTypography so every
  // confirmation in the app shares them.
};

const InlineStatusOverlay = ({
  visible,
  variant,
  title,
  message,
  pip,
  onHide,
  autoDismissMs = 2000,
  pipSize = 92,
  primaryActionLabel,
  onPrimaryAction,
  wide = false,
}: InlineStatusOverlayProps) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // null is "stay until the user acts", so it must short-circuit before the
  // Math.max below — Math.max(null, 3000) is 3000, which would silently turn a
  // persistent card back into a 3-second one.
  const dismissAfterMs =
    autoDismissMs === null
      ? null
      : // Never dismiss before Pip has finished his beat.
        Math.max(autoDismissMs, (pip && PIP_MIN_DISMISS_MS[pip]) ?? 0);

  useEffect(() => {
    if (!visible) return undefined;

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Persistent: entrance only, no timer, so onHide never fires here.
    if (dismissAfterMs === null) return undefined;

    dismissTimerRef.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onHide();
      });
    }, dismissAfterMs);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dismissAfterMs]);

  if (!visible) return null;

  const isSuccess = variant === 'success';
  const showPrimaryAction = !!primaryActionLabel && !!onPrimaryAction;

  return (
    // pointerEvents "auto" (the default) briefly blocks taps on the content
    // behind the dim, same as CustomAlert/SuccessModal do while they're shown —
    // it prevents an accidental second tap on a result card while the
    // confirmation is up, and this overlay still clears itself automatically.
    <Animated.View style={[styles.overlay, wide && styles.overlayWide, { opacity }]}>
      <View style={[styles.card, wide && styles.cardWide]}>
        {pip ? (
          <View style={[styles.pipSlot, { height: pipSize }]}>
            <PipBird size={pipSize} state={pip} />
          </View>
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: isSuccess ? PAL.successBg : PAL.errorBg }]}>
            <Ionicons name={isSuccess ? 'checkmark' : 'close'} size={26} color="#fff" />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
        {!!message && <Text style={styles.message}>{message}</Text>}

        {showPrimaryAction && (
          <TouchableOpacity
            onPress={onPrimaryAction}
            accessibilityRole="button"
            accessibilityLabel={primaryActionLabel}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PAL.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    zIndex: 50,
  },
  // Mockup gutter. Only applied in `wide` mode.
  overlayWide: {
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 28,
    alignItems: 'center',
    minWidth: 220,
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  // `alignSelf` rather than `width: '100%'`: the card's parent sizes to content,
  // and a percentage width against an indefinite parent does not fill it — that
  // is what left the reset-success button looking undersized on device.
  cardWide: {
    alignSelf: 'stretch',
    maxWidth: undefined,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  // Bottom-aligned so Pip stands on the card's baseline rather than floating.
  // height is overridden per-instance to match pipSize.
  pipSlot: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  // Pill, per PASSWORD_SCREENS.html `.btn { border-radius: 999px }`. The 12px
  // radius this shipped with is the mockup's `.btn.flat` variant, used on the
  // form buttons rather than on card actions.
  primaryButton: {
    marginTop: 12,
    alignSelf: 'stretch',
    backgroundColor: PAL.successBg,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Weight/colour/alignment come from the shared confirmation scale so this card
  // reads as the same family as CustomAlert and SuccessModal.
  title: {
    ...confirmationType.titleCompact,
    marginBottom: 4,
  },
  message: confirmationType.messageCompact,
});

export default InlineStatusOverlay;
