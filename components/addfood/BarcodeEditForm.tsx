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

type Props = {
  form: BarcodeReportForm;
  barcode: string;
  onChange: (patch: Partial<BarcodeReportForm>) => void;
  onSubmit: () => void;
  onReset: () => void;
  onBack: () => void;
  onClose: () => void;
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
  onClose,
  disabled = false,
  isPristine,
}: Props) => (
  <View style={[StyleSheet.absoluteFill, { backgroundColor: '#EFF3F7' }]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View className="flex-row items-center justify-between px-4 pt-14 pb-2">
        <TouchableOpacity
          onPress={onBack}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Back to the scanned product"
          className="rounded-full items-center justify-center"
          style={{ width: 32, height: 32, backgroundColor: '#E5E7EB' }}
        >
          <Ionicons name="arrow-back" size={17} color="#374151" />
        </TouchableOpacity>

        <Text className="text-base font-extrabold" style={{ color: '#0B2149' }}>Edit food details</Text>

        <TouchableOpacity
          onPress={onClose}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Close the scanner"
          className="rounded-full items-center justify-center"
          style={{ width: 32, height: 32, backgroundColor: '#E5E7EB' }}
        >
          <Ionicons name="close" size={17} color="#374151" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="px-4"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center mb-2">
          <PipBird state="happy" size={48} />
          <View className="flex-1 ml-2">
            <Text className="text-[14.5px] font-extrabold" style={{ color: '#0B2149' }}>Scanned from the label</Text>
            <Text className="text-[11.5px]" style={{ color: '#6B7280' }}>Barcode {barcode}</Text>
          </View>
        </View>

        <View className="rounded-2xl p-3" style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DAE2EC' }}>
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

        <TouchableOpacity
          onPress={onSubmit}
          disabled={disabled}
          accessibilityRole="button"
          className="rounded-2xl py-3 items-center mt-3"
          style={{ backgroundColor: disabled ? '#BFDBFE' : '#007BFF' }}
        >
          <Text className="text-white font-bold text-base">Add to Meal Plan</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>
);

export default BarcodeEditForm;
