/**
 * Shared geometry for the barcode bottom sheets.
 *
 * The first build hard-coded 20 px under the last control. On an iPhone 13
 * the home indicator alone claims 34 pt of that, so the button sat almost on
 * top of it (device feedback 2026-09-23). The padding has to come from the
 * device, not from a number picked on a simulator: `insets.bottom` is 34 on a
 * notched iPhone, 0 on a phone with a physical home button, and a floor keeps
 * the second case from looking cramped.
 *
 * Every sheet in this flow uses this, so the found card, the edit form and the
 * label report end at the same distance from the edge.
 */

import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Breathing room when the device asks for none (older iPhones, most Android). */
export const SHEET_BOTTOM_MIN = 18;
/** Clear air between the last control and the home indicator. */
export const SHEET_BOTTOM_EXTRA = 12;

export const useSheetBottomPadding = (): number => {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, SHEET_BOTTOM_MIN) + SHEET_BOTTOM_EXTRA;
};
