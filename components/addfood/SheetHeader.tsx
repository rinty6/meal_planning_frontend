/**
 * The header every barcode sheet wears (Design C, header option C, chosen
 * 2026-09-24).
 *
 * It exists as one component because this header has now drifted twice. The
 * found sheet and the edit sheet were built separately, diverged, were matched
 * by copying the edit sheet's title bar, and that copy put the title on its own
 * line ABOVE Pip while the row beside Pip carried only the small print. Sharing
 * the component is what stops the next round of that.
 *
 * Two rows:
 *
 *   1. The grabber, with the back arrow beside it when there is somewhere to go
 *      back to. Chrome lives here, on its own line, so the row underneath is
 *      identical on every sheet. The arrow is not floated over the content
 *      because at this Pip size it would land on the bird.
 *   2. Pip, and beside it the title, an optional subtitle, and the barcode as a
 *      chip in the app's blue — the same treatment BarcodeLookupCard already
 *      gives the digits, so one number looks the same everywhere in the flow.
 */

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PipBird, { type PipState } from '../pip/PipBird';

type Props = {
  title: string;
  /** Left out where it would only restate what the user just did. */
  subtitle?: string;
  barcode: string;
  pip: PipState;
  /**
   * 84 on the found and edit sheets, where the header is most of what is on
   * screen. The report sheet passes less: its header sits OUTSIDE the scroll
   * view, so every pixel here is a pixel the form loses with the keyboard up.
   */
  pipSize?: number;
  /** Renders the back arrow. Absent on a sheet with nowhere to go back to. */
  onBack?: () => void;
  disabled?: boolean;
};

const SheetHeader = ({ title, subtitle, barcode, pip, pipSize = 84, onBack, disabled = false }: Props) => (
  <View>
    <View className="flex-row items-center" style={{ height: 30, marginBottom: 4 }}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Back to the scanned product"
          className="rounded-full items-center justify-center"
          style={{ width: 30, height: 30, backgroundColor: '#EEF2F6' }}
        >
          <Ionicons name="arrow-back" size={16} color="#374151" />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 30, height: 30 }} />
      )}

      <View className="flex-1 items-center">
        <View className="rounded-full" style={{ width: 40, height: 5, backgroundColor: '#E3E8EF' }} />
      </View>

      {/* Balances the arrow so the grabber stays centred on both sheets. */}
      <View style={{ width: 30, height: 30 }} />
    </View>

    <View className="flex-row items-center mb-2.5">
      <PipBird state={pip} size={pipSize} />
      <View className="flex-1 ml-2.5">
        <Text className="text-[19px] font-extrabold" style={{ color: '#0B2149' }}>{title}</Text>
        {subtitle ? (
          <Text className="text-[12.5px] mt-0.5" style={{ color: '#475569' }}>{subtitle}</Text>
        ) : null}
        <View
          className="self-start rounded-lg px-2 py-0.5 mt-1"
          style={{ backgroundColor: '#E7F1FF' }}
          accessibilityLabel={`Barcode ${barcode.split('').join(' ')}`}
        >
          <Text className="text-[11.5px] font-bold" style={{ color: '#007BFF', letterSpacing: 0.9 }}>
            {barcode}
          </Text>
        </View>
      </View>
    </View>
  </View>
);

export default SheetHeader;
