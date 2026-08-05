import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PipBird from './PipBird';
import type { PipCardModel } from './pipHomeState';

type PipReminderCardProps = {
  model: PipCardModel;
  onPress: () => void;
};

/**
 * Home dashboard reminder card. Replaces the old hero image: Pip plus a single
 * line of copy that always states the situation in words, so nothing depends on
 * the animation being visible (motion spec, accessibility).
 */
export default function PipReminderCard({ model, onPress }: PipReminderCardProps) {
  return (
    <TouchableOpacity
      accessibilityHint="Opens the food log"
      accessibilityLabel={`${model.title} ${model.subline}`}
      accessibilityRole="button"
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderColor: '#DAE2EC',
        borderRadius: 16,
        borderWidth: 1,
        elevation: 3,
        flexDirection: 'row',
        marginBottom: 24,
        padding: 14,
        shadowColor: '#0F172A',
        shadowOffset: { height: 2, width: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      }}
    >
      <View
        style={{
          alignItems: 'flex-end',
          flex: 0,
          height: 76,
          justifyContent: 'center',
          width: 76,
        }}
      >
        {/* Remount per state so a repeated one-shot (happy, eating) replays. */}
        <PipBird key={model.state} size={76} state={model.state} />
      </View>

      <View style={{ flex: 1, gap: 3, paddingLeft: 12 }}>
        <Text style={{ color: '#000000', fontSize: 16, fontWeight: '700' }}>{model.title}</Text>
        <Text style={{ color: '#6B7280', fontSize: 12, lineHeight: 17 }}>{model.subline}</Text>
      </View>

      <Ionicons color="#007BFF" name="chevron-forward" size={15} style={{ flex: 0 }} />
    </TouchableOpacity>
  );
}
