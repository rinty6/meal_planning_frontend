/**
 * "Edit food details" (Design C, screen 4): the scanned label, prefilled and
 * editable.
 *
 * Deliberately the same layout as the not-found report form so the two read as
 * one family, with the happy rig instead of the sad one. What differs is
 * meaning, and the header says it: this changes what goes into YOUR meal log.
 * Correcting our catalogue is the report path, not this one.
 *
 * Energy is kJ here because that is what the pack prints and what the user is
 * copying. It converts to the stored kcal once, in the mapper, on the way out.
 *
 * Shape: a bottom sheet, the same one the found screen uses, rather than a
 * full-screen page (feedback 2026-09-23). A page is as tall as the screen, so
 * this short form left half a screen of empty background under its button. A
 * sheet is as tall as its content, and the two screens of one flow now read as
 * one surface being edited in place. `maxHeight` plus the inner ScrollView
 * cover the case where the content IS tall: a small screen with the keyboard
 * up.
 *
 * Chrome: the back arrow and nothing else. The ✕ went with the found sheet's,
 * because backing out of an edit means going back to the product, not leaving
 * the flow from a screen full of half-typed numbers.
 *
 * Keyboard: the form scrolls inside a KeyboardAvoidingView. The keyboard is an
 * OS layer above everything, so this is handled here rather than with zIndex
 * on a parent (ERROR_LOG 075).
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { BarcodeReportForm } from '../../api/barcode/barcodeApi.types';
import PipBird from '../pip/PipBird';
import { useSheetBottomPadding } from './sheetLayout';

type Props = {
  form: BarcodeReportForm;
  barcode: string;
  onChange: (patch: Partial<BarcodeReportForm>) => void;
  onSubmit: () => void;
  onReset: () => void;
  onBack: () => void;
  disabled?: boolean;
  /** False once a field differs from the scanned label. */
  isPristine: boolean;
};

type FieldProps = {
  label: string;
  value: string;
  unit?: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
  flex?: number;
  editable: boolean;
};

const Field = ({ label, value, unit, onChangeText, keyboardType = 'default', flex = 1, editable }: FieldProps) => (
  <View style={{ flex }}>
    <Text className="text-[10.5px] font-bold mb-1" style={{ color: '#6B7280' }}>{label}</Text>
    <View
      className="flex-row items-center rounded-xl px-3"
      style={{ backgroundColor: '#EEF2F6', minHeight: 38 }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        accessibilityLabel={label}
        className="flex-1 text-[13px]"
        style={{ color: '#0B2149', paddingVertical: 8 }}
        placeholderTextColor="#9AA3B2"
      />
      {unit ? <Text className="text-[11px] ml-1" style={{ color: '#9AA3B2' }}>{unit}</Text> : null}
    </View>
  </View>
);

const BarcodeEditForm = ({
  form,
  barcode,
  onChange,
  onSubmit,
  onReset,
  onBack,
  disabled = false,
  isPristine,
}: Props) => {
  const paddingBottom = useSheetBottomPadding();

  return (
  <View style={StyleSheet.absoluteFill}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />

    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'flex-end' }}
    >
      <View className="rounded-t-3xl px-4 pt-2.5" style={{ backgroundColor: '#FFFFFF', maxHeight: '92%', paddingBottom }}>
        <View className="self-center rounded-full mb-2" style={{ width: 40, height: 5, backgroundColor: '#E3E8EF' }} />

        <View className="flex-row items-center mb-1.5">
          <TouchableOpacity
            onPress={onBack}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Back to the scanned product"
            className="rounded-full items-center justify-center"
            style={{ width: 32, height: 32, backgroundColor: '#EEF2F6' }}
          >
            <Ionicons name="arrow-back" size={17} color="#374151" />
          </TouchableOpacity>

          <Text className="flex-1 text-base font-extrabold text-center" style={{ color: '#0B2149' }}>
            Edit food details
          </Text>

          {/* Balances the arrow so the title sits centred. */}
          <View style={{ width: 32, height: 32 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center mb-2">
            <PipBird state="happy" size={48} />
            <View className="flex-1 ml-2">
              <Text className="text-[14.5px] font-extrabold" style={{ color: '#0B2149' }}>Scanned from the label</Text>
              <Text className="text-[11.5px]" style={{ color: '#6B7280' }}>Barcode {barcode}</Text>
            </View>
          </View>

          <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: '#E3E8EF' }}>
            <View className="mb-1.5">
              <Field label="Food name" value={form.productName} editable={!disabled} onChangeText={(t) => onChange({ productName: t })} />
            </View>

            <View className="flex-row mb-1.5" style={{ gap: 8 }}>
              <Field label="Brand" value={form.brand} editable={!disabled} onChangeText={(t) => onChange({ brand: t })} />
              <Field
                label="Serving size"
                value={form.servingSize}
                unit={form.servingUnit}
                keyboardType="decimal-pad"
                flex={0.72}
                editable={!disabled}
                onChangeText={(t) => onChange({ servingSize: t })}
              />
            </View>

            <View className="flex-row mb-1.5" style={{ gap: 8 }}>
              <Field label="Energy" value={form.energyKj} unit="kJ" keyboardType="decimal-pad" editable={!disabled} onChangeText={(t) => onChange({ energyKj: t })} />
              <Field label="Protein" value={form.proteinG} unit="g" keyboardType="decimal-pad" editable={!disabled} onChangeText={(t) => onChange({ proteinG: t })} />
            </View>

            <View className="flex-row mb-1" style={{ gap: 8 }}>
              <Field label="Carbs" value={form.carbohydrateG} unit="g" keyboardType="decimal-pad" editable={!disabled} onChangeText={(t) => onChange({ carbohydrateG: t })} />
              <Field label="Fat" value={form.fatG} unit="g" keyboardType="decimal-pad" editable={!disabled} onChangeText={(t) => onChange({ fatG: t })} />
            </View>

            <TouchableOpacity
              onPress={onReset}
              disabled={disabled || isPristine}
              accessibilityRole="button"
              className="items-center py-2"
            >
              <Text className="text-xs font-bold" style={{ color: isPristine ? '#C7D2E0' : '#007BFF' }}>
                ↺ Reset to label values
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Outside the ScrollView, like the picker's confirm: when the sheet is
            capped by the keyboard the button is still on screen. */}
        <TouchableOpacity
          onPress={onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          className="rounded-2xl py-3 items-center mt-3"
          style={{ backgroundColor: disabled ? '#BFDBFE' : '#007BFF' }}
        >
          <Text className="text-white font-bold text-base">Add to Meal Plan</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </View>
  );
};

export default BarcodeEditForm;
