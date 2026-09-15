/**
 * DEV-ONLY HARNESS for PipActionStatusCard.
 *
 * Previews every lifecycle the card can run without writing a real meal:
 * fast and slow responses, all four outcomes, both failure copies, and a long
 * item name. Reduce Motion is exercised by toggling it in iOS Settings while
 * this screen is open.
 *
 * Reached from the meal menu's "Pip status harness" row, which only renders in
 * __DEV__. Checklist p9-2: delete this file and that row before release.
 */

import React, { useCallback } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PipActionStatusCard, usePipActionStatus } from '../components/pip/PipActionStatusCard';
import {
  MealLogPartialError,
  MealLogRequestError,
  resolveMealLogOutcome,
  type MealLogOutcome,
} from '../services/mealLogOutcome';

type Scenario = {
  label: string;
  detail: string;
  itemLabel: string;
  plural?: boolean;
  delayMs: number;
  payload?: Record<string, unknown>;
  failWith?: 'server' | 'network' | 'partial';
};

const SCENARIOS: Scenario[] = [
  { label: 'Fast · added', detail: '150 ms reply; floor holds to 800 ms; Pip eats', itemLabel: 'Grilled chicken salad', delayMs: 150, payload: { targetZone: 'under' } },
  { label: 'Slow · added', detail: '3.5 s reply; Pip thinks the whole time', itemLabel: 'Grilled chicken salad', delayMs: 3500, payload: { targetZone: 'under' } },
  { label: 'On target', detail: 'reachedTarget: true → happy (fires once a day for real)', itemLabel: 'Miso salmon bowl', delayMs: 600, payload: { targetZone: 'on_target', reachedTarget: true } },
  { label: 'In band, not first time', detail: 'on_target without reachedTarget → plain eating (C2)', itemLabel: 'Miso salmon bowl', delayMs: 600, payload: { targetZone: 'on_target', reachedTarget: false } },
  { label: 'Over target', detail: 'targetZone: over → confident, food still logged', itemLabel: 'Chicken salad sandwich', delayMs: 600, payload: { targetZone: 'over', exceededLimit: true } },
  { label: 'Batch of 3', detail: 'plural copy', itemLabel: '3 items', plural: true, delayMs: 900, payload: { targetZone: 'under' } },
  { label: 'Long item name', detail: 'title must wrap inside the 244 px card, never widen it', itemLabel: 'Slow-roasted Mediterranean vegetable and halloumi grain bowl with tahini', delayMs: 600, payload: { targetZone: 'under' } },
  { label: 'Failed · server replied', detail: '500 with a body → "Nothing was saved."', itemLabel: 'Grilled chicken salad', delayMs: 900, failWith: 'server' },
  { label: 'Failed · connection dropped', detail: 'no reply → "Check your meal log before trying again."', itemLabel: 'Grilled chicken salad', delayMs: 900, failWith: 'network' },
  { label: 'Failed · partial combo', detail: 'combo item 3 of 3 refused after 2 saved → count stated (Phase 4)', itemLabel: '3 items', plural: true, delayMs: 900, failWith: 'partial' },
];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function DevPipStatusScreen() {
  const router = useRouter();
  const pipStatus = usePipActionStatus();

  const runScenario = useCallback(
    (scenario: Scenario) => {
      void pipStatus.run({
        loading: { title: `Adding ${scenario.itemLabel}…`, message: 'Saving to lunch' },
        context: { itemLabel: scenario.itemLabel, mealType: 'lunch', plural: scenario.plural },
        task: async (): Promise<MealLogOutcome> => {
          await wait(scenario.delayMs);
          if (scenario.failWith === 'server') throw new MealLogRequestError('Could not save food', 500);
          if (scenario.failWith === 'network') throw new TypeError('Network request failed');
          if (scenario.failWith === 'partial') throw new MealLogPartialError(2, 3, new MealLogRequestError('Could not save food', 500));
          return resolveMealLogOutcome(scenario.payload, {
            itemLabel: scenario.itemLabel,
            mealType: 'lunch',
            plural: scenario.plural,
          });
        },
        onDismiss: (result) => {
          console.log('[dev-pip-status] dismissed', result.kind, result.title);
        },
      });
    },
    [pipStatus]
  );

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button">
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Pip status harness</Text>
        <Text style={styles.sub}>
          Dev only. Each row runs the full card lifecycle against a fake request. Toggle Reduce Motion in
          Settings to check the static poses and the button still waking.
        </Text>

        <View style={styles.list}>
          {SCENARIOS.map((scenario) => (
            <TouchableOpacity
              key={scenario.label}
              onPress={() => runScenario(scenario)}
              disabled={pipStatus.isBusy}
              style={[styles.row, pipStatus.isBusy && styles.rowDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.rowLabel}>{scenario.label}</Text>
              <Text style={styles.rowDetail}>{scenario.detail}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.phase}>phase: {pipStatus.status.phase}</Text>
      </ScrollView>

      {/* Last child of the root view, exactly as a real screen renders it. */}
      <PipActionStatusCard {...pipStatus.cardProps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EFF3F7' },
  content: { padding: 20, paddingBottom: 40 },
  back: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12 },
  backText: { color: '#007BFF', fontSize: 16, fontWeight: '700' },
  heading: { fontSize: 24, fontWeight: '800', color: '#0B2149', marginTop: 6 },
  sub: { fontSize: 13, lineHeight: 19, color: '#6B7280', marginTop: 6, marginBottom: 18 },
  list: { gap: 10 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6EDF5',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowDisabled: { opacity: 0.5 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: '#0B2149' },
  rowDetail: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  phase: { marginTop: 18, fontSize: 12, color: '#94A3B8', fontFamily: 'Menlo', textAlign: 'center' },
});
