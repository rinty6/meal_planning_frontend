/**
 * SHARED CONFIRMATION TYPOGRAPHY
 *
 * One definition of how a confirmation reads, used by every surface that shows
 * one: CustomAlert, SuccessModal, AddFoodModal's in-modal alert and saving card,
 * and InlineStatusOverlay.
 *
 * These had drifted into three different formats — the voice-search overlay used
 * an 800 weight and a navy #0B2149 title while the dialogs used 700 and #111827,
 * which is what made the same message read as belonging to a different app.
 *
 * Size may vary with context (a full dialog vs a compact status card), but
 * weight, colour and alignment never do. That is what keeps them a family.
 */

import { StyleSheet } from 'react-native';

export const CONFIRMATION_COLORS = {
  message: '#6B7280',
  title: '#111827',
} as const;

export const confirmationType = StyleSheet.create({
  /** Full-size dialogs: CustomAlert, SuccessModal, the in-modal alert. */
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: CONFIRMATION_COLORS.title,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: CONFIRMATION_COLORS.message,
    textAlign: 'center',
  },

  /** Compact cards layered inside another modal: status overlay, saving card. */
  titleCompact: {
    fontSize: 17,
    fontWeight: '700',
    color: CONFIRMATION_COLORS.title,
    textAlign: 'center',
  },
  messageCompact: {
    fontSize: 13,
    lineHeight: 18,
    color: CONFIRMATION_COLORS.message,
    textAlign: 'center',
  },
});
