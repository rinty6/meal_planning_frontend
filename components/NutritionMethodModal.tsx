// Explains how TheMealDB recipe nutrition is estimated, using a worked example
// (Aussie Burgers). Shown from the Explore by Cuisine screen via an info button.
// Single, self-contained Modal — safe to mount on the explore screen (no other modals there).

import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Row = { name: string; measure: string; grams: number | null; per100: number | null; total: number };

// Worked example, taken straight from the offline pipeline output for Aussie Burgers.
// Two ingredients aren't matched in USDA, so they contribute 0 — shown on purpose
// to make the "estimate" honest.
const EXAMPLE_TITLE = 'Aussie Burgers';
const EXAMPLE_ROWS: Row[] = [
  { name: 'Lean Minced Steak', measure: '500g', grams: 500, per100: 264, total: 1320 },
  { name: 'Cooked Beetroot', measure: '100g', grams: 100, per100: 212, total: 212 },
  { name: 'Naan Bread', measure: '2 small', grams: 70, per100: 311, total: 218 },
  { name: 'Rocket', measure: '50g', grams: 50, per100: null, total: 0 },
  { name: 'Soured cream & chive dip', measure: '4 tbsp', grams: null, per100: null, total: 0 },
];
const EXAMPLE_TOTAL = 1750;

const cell = (v: number | null, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

const NutritionMethodModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/50 justify-center items-center px-4">
          <TouchableWithoutFeedback>
            <View className="bg-white w-full max-w-md rounded-3xl overflow-hidden" style={{ maxHeight: '85%' }}>
              {/* Header */}
              <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <Text className="text-lg font-bold text-gray-900">How calories are estimated</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView className="px-5" contentContainerStyle={{ paddingVertical: 14 }}>
                <Text className="text-gray-600 text-sm mb-3">
                  These recipes don&apos;t come with nutrition, so we estimate it from the ingredients:
                  each measure is converted to grams, multiplied by that ingredient&apos;s calories per 100g
                  (from the USDA database), and added up.
                </Text>
                <Text className="text-gray-900 font-bold text-sm mb-2">Example · {EXAMPLE_TITLE}</Text>

                {/* Table */}
                <View className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* head */}
                  <View className="flex-row bg-gray-50 px-2 py-2">
                    <Text className="text-gray-500 text-xs font-bold" style={{ flex: 3 }}>Ingredient</Text>
                    <Text className="text-gray-500 text-xs font-bold" style={{ flex: 2 }}>Measure</Text>
                    <Text className="text-gray-500 text-xs font-bold text-right" style={{ flex: 1.4 }}>Grams</Text>
                    <Text className="text-gray-500 text-xs font-bold text-right" style={{ flex: 1.6 }}>/100g</Text>
                    <Text className="text-gray-500 text-xs font-bold text-right" style={{ flex: 1.6 }}>kcal</Text>
                  </View>
                  {EXAMPLE_ROWS.map((r, i) => (
                    <View key={i} className={`flex-row px-2 py-2 ${i % 2 ? 'bg-white' : 'bg-gray-50'}`}>
                      <Text className="text-gray-800 text-xs" style={{ flex: 3 }}>{r.name}</Text>
                      <Text className="text-gray-500 text-xs text-center" style={{ flex: 2 }}>{r.measure}</Text>
                      <Text className="text-gray-700 text-xs text-right" style={{ flex: 1.4 }}>{cell(r.grams, 'g')}</Text>
                      <Text className="text-gray-700 text-xs text-right" style={{ flex: 1.6 }}>{cell(r.per100)}</Text>
                      <Text className="text-gray-900 text-xs text-right font-semibold" style={{ flex: 1.6 }}>{cell(r.total)}</Text>
                    </View>
                  ))}
                  {/* total */}
                  <View className="flex-row px-2 py-2 border-t border-gray-200 bg-orange-50">
                    <Text className="text-secondary text-xs font-bold" style={{ flex: 6.4 }}>Estimated total (whole recipe)</Text>
                    <Text className="text-secondary text-xs font-bold text-right" style={{ flex: 1.6 }}>{EXAMPLE_TOTAL}</Text>
                  </View>
                </View>

                <Text className="text-gray-400 text-xs mt-3">
                  Ingredients we can&apos;t match (e.g. Rocket here) are skipped, so totals can run slightly low.
                  Protein, fat and carbs use the exact same method. Totals are for the whole recipe — divide by
                  servings when logging a portion.
                </Text>
              </ScrollView>

              <TouchableOpacity onPress={onClose} className="m-4 bg-primary rounded-xl py-3 items-center">
                <Text className="text-white font-bold">Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default NutritionMethodModal;
