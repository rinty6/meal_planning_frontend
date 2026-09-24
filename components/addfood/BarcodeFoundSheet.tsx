/**
 * "Found it!" (Design C, screen 3). A white sheet over the dimmed Add Food
 * sheet carrying the same card the search results use, so a scanned food and a
 * searched food are the same object to the user.
 *
 * Laid out as BarcodeEditForm, deliberately (device feedback 2026-09-24): the
 * shared SheetHeader, the same bordered card, and the numbers in the same
 * two-column grid and the same order as the fields that edit them. Tapping
 * "Edit details" should feel like these numbers became editable in place, not
 * like a different screen opened. The first build merged the title into the
 * Pip row and put four nutrition tiles on one line, which left the sheet both
 * shorter than the design and cramped on a phone; the fix for that then put
 * the title on a bar of its own ABOVE Pip, which is why the header is a shared
 * component now rather than something each sheet lays out again.
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
import SheetHeader from './SheetHeader';
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

/** One number, shaped like the field that edits it on the next screen. */
const Stat = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <View style={{ flex: 1 }}>
    <Text className="text-[10.5px] font-bold mb-1" style={{ color: '#6B7280' }}>{label}</Text>
    <View className="flex-row items-center rounded-xl px-3" style={{ backgroundColor: '#EEF2F6', minHeight: 38 }}>
      <Text className="flex-1 text-[13px] font-bold" style={{ color: '#0B2149' }} numberOfLines={1}>
        {value}
      </Text>
      {unit ? <Text className="text-[11px] ml-1" style={{ color: '#9AA3B2' }}>{unit}</Text> : null}
    </View>
  </View>
);

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

      <View
        className="absolute left-0 right-0 bottom-0 rounded-t-3xl px-4 pt-2.5"
        style={{ backgroundColor: '#FFFFFF', paddingBottom }}
      >
        <SheetHeader title="Found it!" subtitle="Scanned from the label" barcode={barcode} pip="happy" />

        <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: '#E3E8EF' }}>
          <Text className="text-[15px] font-extrabold" style={{ color: '#0B2149' }} numberOfLines={2}>
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

          <View className="flex-row items-center mt-1.5 mb-2">
            <Ionicons name="scale-outline" size={13} color="#6B7280" />
            <Text className="text-xs ml-1" style={{ color: '#6B7280' }} numberOfLines={1}>
              Per {vm.servingLabel}
            </Text>
          </View>

          {/* Two columns, in the order the edit form asks for them, so one
              number sits in the same place on both screens. */}
          <View className="flex-row mb-1.5" style={{ gap: 8 }}>
            <Stat label="Energy" value={formatEnergy(vm.energyKcal, { withUnit: false })} unit="kJ" />
            <Stat label="Protein" value={formatGrams(vm.proteinG)} />
          </View>
          <View className="flex-row" style={{ gap: 8 }}>
            <Stat label="Carbs" value={formatGrams(vm.carbG)} />
            <Stat label="Fat" value={formatGrams(vm.fatG)} />
          </View>

          <Text className="text-[11px] mt-2.5" style={{ color: source === 'catalog' ? '#10B981' : '#D97706' }}>
            {source === 'catalog'
              ? `✓ From our catalogue${brand ? ` · ${brand} label` : ''}`
              : 'Unverified · straight from Open Food Facts'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onAdd}
          disabled={disabled}
          accessibilityRole="button"
          className="rounded-2xl py-3 items-center mt-3"
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
