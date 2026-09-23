/**
 * "Looking it up…" (Design C, screen 2). The white dialog the rest of the app
 * uses, over the dimmed camera frame, with Pip thinking on it.
 *
 * The two lines are not decoration: they say where the answer is being looked
 * for, so a slow scan reads as work rather than as a hang. The second line
 * only appears once the catalogue has missed, which is also when the wait
 * actually gets long (the live Open Food Facts call is capped at 3 s server
 * side).
 *
 * No exit here, deliberately: the request is already running, and a Cancel
 * would invite a tap that cannot undo anything (feedback 2026-09-22).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PipBird from '../pip/PipBird';

type Props = {
  barcode: string;
  /**
   * 'catalog' while our own lookup runs, 'openfoodfacts' once it has missed
   * and the request is out to OFF. The client cannot see that switch happen
   * on the server, so it is driven by elapsed time: past this point a slow
   * answer is almost always the fallback.
   */
  stage: 'catalog' | 'openfoodfacts';
};

const Row = ({ label, state }: { label: string; state: 'done' | 'running' | 'waiting' }) => (
  <View
    className="flex-row items-center justify-between rounded-xl px-3 py-2 mt-1.5"
    style={{ backgroundColor: '#EEF2F6' }}
  >
    <View className="flex-row items-center flex-1 mr-2">
      {state === 'done' ? (
        <Ionicons name="checkmark" size={14} color="#10B981" />
      ) : (
        <Ionicons name="ellipse" size={8} color={state === 'running' ? '#007BFF' : '#C7D2E0'} />
      )}
      <Text className="text-[12.5px] ml-2" style={{ color: '#475569' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
    <Text className="text-[12px]" style={{ color: state === 'done' ? '#10B981' : '#8A93A3' }}>
      {state === 'done' ? 'checked' : state === 'running' ? 'asking…' : ''}
    </Text>
  </View>
);

const BarcodeLookupCard = ({ barcode, stage }: Props) => (
  <View
    className="items-center justify-center px-4"
    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
  >
    <View
      className="w-full rounded-3xl px-4 pt-5 pb-4 items-center"
      style={{ backgroundColor: '#FFFFFF', maxWidth: 340 }}
      accessibilityLiveRegion="polite"
    >
      <PipBird state="thinking" size={116} />

      <Text className="text-lg font-extrabold mt-1" style={{ color: '#0B2149' }}>
        Looking it up…
      </Text>
      <Text
        className="text-sm font-bold mt-2 mb-3"
        style={{ color: '#007BFF', letterSpacing: 1.5 }}
        accessibilityLabel={`Barcode ${barcode.split('').join(' ')}`}
      >
        {barcode}
      </Text>

      <View className="w-full">
        <Row label="Our catalogue" state={stage === 'catalog' ? 'running' : 'done'} />
        <Row
          label="Open Food Facts"
          state={stage === 'openfoodfacts' ? 'running' : 'waiting'}
        />
      </View>
    </View>
  </View>
);

export default BarcodeLookupCard;
