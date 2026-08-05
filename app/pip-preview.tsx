/**
 * DEV-ONLY preview screen for the Pip mascot rig (checklist p1-6).
 *
 * Open it on a dev client with:
 *   npx uri-scheme open mealapp://pip-preview --ios
 *
 * Delete this file before the EAS build for release, or leave it out of the
 * tab navigation so it is unreachable in production.
 */

import React from 'react';
import { AccessibilityInfo, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import PipBird, { type PipState } from '../components/pip/PipBird';

const STATES: PipState[] = ['idle', 'care', 'happy', 'sad', 'confident', 'eating'];
const ONE_SHOTS: PipState[] = ['happy', 'eating'];
const SIZES = [
  { label: 'Card 76', value: 76 },
  { label: 'Modal 120', value: 120 },
  { label: 'Hero 200', value: 200 },
];

const COPY: Record<PipState, string> = {
  care: '"Time for lunch?"',
  confident: '"420 kcal to go — easy."',
  eating: 'Meal logged',
  happy: '"Target smashed!"',
  idle: 'Dashboard default',
  sad: '"Lunch got skipped."',
};

function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: active ? '#2B7BE0' : '#FFFFFF',
        borderColor: active ? '#2B7BE0' : '#DAE2EC',
        borderRadius: 999,
        borderWidth: 1,
        marginBottom: 8,
        marginRight: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: active ? '#FFFFFF' : '#0B2149', fontSize: 13, fontWeight: '700' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: '#6B7280',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
        marginBottom: 8,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

export default function PipPreviewScreen() {
  const [state, setState] = React.useState<PipState>('idle');
  const [size, setSize] = React.useState(200);
  const [animated, setAnimated] = React.useState(true);
  const [onDark, setOnDark] = React.useState(false);
  const [replayKey, setReplayKey] = React.useState(0);
  const [log, setLog] = React.useState<string[]>([]);
  const [systemReduceMotion, setSystemReduceMotion] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => sub.remove();
  }, []);

  const note = React.useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLog((prev) => [`${stamp}  ${line}`, ...prev].slice(0, 6));
  }, []);

  const pickState = (next: PipState) => {
    setState(next);
    note(`state -> ${next}`);
  };

  return (
    <SafeAreaView style={{ backgroundColor: '#EFF3F7', flex: 1 }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text style={{ color: '#0B2149', fontSize: 26, fontWeight: '800' }}>Pip preview</Text>
        <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16, marginTop: 2 }}>
          Dev-only rig check. System Reduce Motion:{' '}
          <Text style={{ fontWeight: '700' }}>
            {systemReduceMotion === null ? 'reading…' : systemReduceMotion ? 'ON' : 'off'}
          </Text>
        </Text>

        {/* Stage */}
        <View
          style={{
            alignItems: 'center',
            backgroundColor: onDark ? '#0B2149' : '#FFFFFF',
            borderColor: '#DAE2EC',
            borderRadius: 24,
            borderWidth: 1,
            justifyContent: 'center',
            marginBottom: 16,
            minHeight: 260,
            paddingVertical: 20,
          }}
        >
          <PipBird
            animated={animated}
            key={`${state}-${replayKey}`}
            onAnimationComplete={(completed) => note(`${completed} finished -> idle`)}
            size={size}
            state={state}
          />
          <Text
            style={{
              color: onDark ? '#FFFFFF' : '#0B2149',
              fontSize: 16,
              fontWeight: '700',
              marginTop: 8,
            }}
          >
            {COPY[state]}
          </Text>
        </View>

        <SectionLabel>State</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATES.map((s) => (
            <Chip active={state === s} key={s} label={s} onPress={() => pickState(s)} />
          ))}
        </View>

        <SectionLabel>Size</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {SIZES.map((s) => (
            <Chip
              active={size === s.value}
              key={s.value}
              label={s.label}
              onPress={() => setSize(s.value)}
            />
          ))}
        </View>

        <SectionLabel>Options</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip
            active={animated}
            label={animated ? 'Animated' : 'Static pose'}
            onPress={() => setAnimated((v) => !v)}
          />
          <Chip active={onDark} label={onDark ? 'On navy' : 'On white'} onPress={() => setOnDark((v) => !v)} />
          {ONE_SHOTS.includes(state) && (
            <Chip active={false} label="Replay one-shot" onPress={() => setReplayKey((k) => k + 1)} />
          )}
        </View>

        {/* All six at card size: the transition and perf check. */}
        <SectionLabel>All six at 76px (perf + side-by-side)</SectionLabel>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: '#DAE2EC',
            borderRadius: 20,
            borderWidth: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-around',
            paddingVertical: 12,
          }}
        >
          {STATES.map((s) => (
            <View key={s} style={{ alignItems: 'center', marginVertical: 8, width: '30%' }}>
              <PipBird animated={animated} size={76} state={s} />
              <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                {s}
              </Text>
            </View>
          ))}
        </View>

        <SectionLabel>Log</SectionLabel>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: '#DAE2EC',
            borderRadius: 16,
            borderWidth: 1,
            minHeight: 60,
            padding: 12,
          }}
        >
          {log.length === 0 ? (
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Tap a state to begin.</Text>
          ) : (
            log.map((line, i) => (
              <Text key={i} style={{ color: '#4B5563', fontSize: 12, marginBottom: 2 }}>
                {line}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
