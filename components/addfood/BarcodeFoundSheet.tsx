/**
 * "Found it!" (Design C, screen 3). A white sheet over the frozen camera
 * carrying the same card the search results use, so a scanned food and a
 * searched food are the same object to the user.
 *
 * Three actions and no more: add it, correct it, scan the next one. There is
 * no ✕ on the sheet (feedback 2026-09-23): "Scan again" goes back to the
 * camera, which carries the only close button in the flow. Tapping the dimmed
 * area above the sheet also backs out, which is what a sheet is expected to do
 * and what keeps a user who does not want either action from being stuck.
 *
 * A live Open Food Facts answer says so under the numbers. It is the same
 * label data our import reads, but nobody on our side has checked this one,
 * and the card should not imply otherwise.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { FoodCardVM } from '../../api/addFood/addFoodApi.types';
import { formatGrams } from '../../api/addFood/addFoodApi.mappers';
import type { BarcodeSource } from '../../api/barcode/barcodeApi.types';
import { formatEnergy } from '../../utils/energy';
import PipBird from '../pip/PipBird';
import { useSheetBottomPadding } from './sheetLayout';

type Props = {
  vm: FoodCardVM;
  barcode: string;
  source: BarcodeSource;
  onAdd: () => void;
  onEdit: () => void;
  onScanAgain: () => void;
  /** Backing out of the whole barcode flow, onto the Add Food sheet. */
  onClose: () => void;
  disabled: boolean;
};

const BarcodeFoundSheet = ({ vm, barcode, source, onAdd, onEdit, onScanAgain, onClose, disabled }: Props) => {
  const brand = vm.tag.kind === 'brand' ? vm.tag.name : null;
  const paddingBottom = useSheetBottomPadding();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* The dim area is the way out now that the ✕ has gone. */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={disabled ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the scanner"
      />

      <View className="absolute left-0 right-0 bottom-0 rounded-t-3xl px-4 pt-2.5" style={{ backgroundColor: '#FFFFFF', paddingBottom }}>
        <View className="self-center rounded-full mb-2.5" style={{ width: 40, height: 5, backgroundColor: '#E3E8EF' }} />

        <View className="flex-row items-center mb-1.5">
          <PipBird state="happy" size={54} />
          <View className="flex-1 ml-2">
            <Text className="text-lg font-extrabold" style={{ color: '#0B2149' }}>Found it!</Text>
            <Text className="text-[11.5px]" style={{ color: '#6B7280' }}>Barcode {barcode}</Text>
          </View>
        </View>

        {/* The Design 3 card, laid out for a sheet rather than a list row. */}
        <View className="rounded-2xl p-3 mb-2" style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DAE2EC' }}>
          <Text className="text-base font-extrabold" style={{ color: '#0B2149' }} numberOfLines={2}>
            {vm.title}
          </Text>

          <View className="flex-row items-center mt-1.5" style={{ gap: 6 }}>
            {brand && (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#FFF2E0' }}>
                <Text className="text-[11px] font-bold" style={{ color: '#7A4A00' }} numberOfLines={1}>{brand}</Text>
              </View>
            )}
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#E7F1FF' }}>
              <Text className="text-[11px] font-bold" style={{ color: '#007BFF' }}>Scanned</Text>
            </View>
          </View>

          <View className="flex-row items-center mt-1.5">
            <Ionicons name="scale-outline" size={13} color="#6B7280" />
            <Text className="text-xs ml-1" style={{ color: '#6B7280' }} numberOfLines={1}>
              Per {vm.servingLabel}
            </Text>
          </View>

          <View className="flex-row mt-2.5" style={{ gap: 6 }}>
            {[
              { value: formatEnergy(vm.energyKcal, { withUnit: false }), label: 'kJ' },
              { value: formatGrams(vm.proteinG), label: 'Protein' },
              { value: formatGrams(vm.fatG), label: 'Fat' },
              { value: formatGrams(vm.carbG), label: 'Carbs' },
            ].map((tile) => (
              <View key={tile.label} className="flex-1 rounded-xl py-2 items-center" style={{ backgroundColor: '#EEF2F6' }}>
                <Text className="text-sm font-bold" style={{ color: '#0B2149' }} numberOfLines={1}>{tile.value}</Text>
                <Text className="text-[10.5px]" style={{ color: '#6B7280' }}>{tile.label}</Text>
              </View>
            ))}
          </View>

          <Text className="text-[11px] mt-2" style={{ color: source === 'catalog' ? '#10B981' : '#D97706' }}>
            {source === 'catalog'
              ? `✓ From our catalogue${brand ? ` · ${brand} label` : ''}`
              : 'Unverified · straight from Open Food Facts'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onAdd}
          disabled={disabled}
          accessibilityRole="button"
          className="rounded-2xl py-3 items-center mt-1"
          style={{ backgroundColor: disabled ? '#BFDBFE' : '#007BFF' }}
        >
          <Text className="text-white font-bold text-base">Add to Meal Plan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onEdit}
          disabled={disabled}
          accessibilityRole="button"
          className="rounded-2xl py-3 items-center mt-2"
          style={{ backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: disabled ? '#BFDBFE' : '#007BFF' }}
        >
          <Text className="font-bold text-base" style={{ color: disabled ? '#BFDBFE' : '#007BFF' }}>Edit details</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onScanAgain} disabled={disabled} accessibilityRole="button" className="py-3 items-center">
          <Text className="font-bold text-[13px]" style={{ color: disabled ? '#BFDBFE' : '#007BFF' }}>Scan again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default BarcodeFoundSheet;
