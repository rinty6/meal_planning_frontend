/**
 * "Add to meal log" (Design C, screen 5): how much, of which serving, and to
 * which meal.
 *
 * This is the dialog from app/(tabs)/meal/comboDetail.tsx, kept to the same
 * shape and the same 0.5 stepper, with one row added: the servings the product
 * itself declares. Built as a shared component so recipe detail and combo
 * detail can adopt it later instead of a third copy drifting away from the
 * first two.
 *
 * The meal is PRE-SELECTED from the sheet the scanner was opened in, never
 * inferred from the clock. That was the complaint that started this redesign:
 * a dinner scan landing in breakfast. Pre-selection keeps the common case at
 * one tap while leaving the choice visible.
 *
 * Rendered inside whatever surface is already up, never as a nested native
 * Modal (ERROR_LOG 019, 055).
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { BarcodeServing } from '../../api/barcode/barcodeApi.types';
import { energyKjFor, servingChipLabel, servingKey } from '../../api/barcode/barcodeApi.mappers';

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'] as const;
export type MealTypeLabel = (typeof MEAL_TYPES)[number];

type Props = {
  servings: BarcodeServing[];
  selectedServingKey: string | null;
  quantity: number;
  /** Lower-case or capitalised both work; comparison is case-insensitive. */
  selectedMeal: string;
  onChangeServing: (key: string) => void;
  onChangeQuantity: (quantity: number) => void;
  onChangeMeal: (meal: MealTypeLabel) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  /**
   * Energy per serving when there is no BarcodeServing to read it from: the
   * label-report path, where the user typed the number themselves.
   */
  fallbackEnergyKj?: number | null;
};

const STEP = 0.5;

const MealServingPicker = ({
  servings,
  selectedServingKey,
  quantity,
  selectedMeal,
  onChangeServing,
  onChangeQuantity,
  onChangeMeal,
  onConfirm,
  onCancel,
  disabled = false,
  fallbackEnergyKj = null,
}: Props) => {
  const active = servings.find((serving) => servingKey(serving) === selectedServingKey) ?? servings[0] ?? null;
  const totalKj = active
    ? energyKjFor(active, quantity)
    : fallbackEnergyKj === null || fallbackEnergyKj === undefined
      ? null
      : Math.round(fallbackEnergyKj * quantity);
  const mealLabel = MEAL_TYPES.find((meal) => meal.toLowerCase() === String(selectedMeal).toLowerCase()) ?? 'Dinner';

  return (
    <View
      className="items-center justify-center px-4"
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
    >
      <View className="w-full rounded-3xl px-4 pt-5 pb-4" style={{ backgroundColor: '#FFFFFF', maxWidth: 340, maxHeight: '92%' }}>
        <Text className="text-lg font-extrabold text-center" style={{ color: '#0B2149' }}>Add to meal log</Text>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text className="text-center text-[12.5px] mt-3 mb-2" style={{ color: '#9AA3B2' }}>How many servings?</Text>
          <View className="flex-row items-center justify-center" style={{ gap: 20 }}>
            <TouchableOpacity
              onPress={() => onChangeQuantity(Math.max(STEP, Math.round((quantity - STEP) * 2) / 2))}
              disabled={disabled || quantity <= STEP}
              accessibilityRole="button"
              accessibilityLabel="One less serving"
              className="rounded-full items-center justify-center"
              style={{ width: 42, height: 42, backgroundColor: '#EEF2F6', opacity: quantity <= STEP ? 0.5 : 1 }}
            >
              <Ionicons name="remove" size={22} color="#111827" />
            </TouchableOpacity>

            <Text className="font-bold text-center" style={{ fontSize: 22, minWidth: 46, color: '#0B2149' }}>
              {quantity}
            </Text>

            <TouchableOpacity
              onPress={() => onChangeQuantity(Math.round((quantity + STEP) * 2) / 2)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="One more serving"
              className="rounded-full items-center justify-center"
              style={{ width: 42, height: 42, backgroundColor: '#007BFF' }}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          {/* Already kJ: energyKjFor reads the serving's own energy_kj, so this
              line must NOT go through formatEnergy, which converts from kcal. */}
          <Text className="text-center text-xs mt-1" style={{ color: '#9AA3B2' }}>
            {totalKj === null ? ' ' : `= ${totalKj.toLocaleString()} kJ`}
          </Text>

          {servings.length > 0 && (
            <>
              <Text className="text-center text-[12.5px] mt-3 mb-2" style={{ color: '#9AA3B2' }}>Of which serving?</Text>
              <View className="flex-row flex-wrap justify-center" style={{ gap: 7 }}>
                {servings.map((serving) => {
                  const key = servingKey(serving);
                  const isActive = key === (selectedServingKey ?? servingKey(servings[0]));
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => onChangeServing(key)}
                      disabled={disabled}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      className="rounded-full px-3 py-1.5"
                      style={{
                        borderWidth: 1.5,
                        borderColor: isActive ? '#007BFF' : '#DAE2EC',
                        backgroundColor: isActive ? '#E7F1FF' : '#FFFFFF',
                      }}
                    >
                      <Text className="text-xs font-bold" style={{ color: isActive ? '#007BFF' : '#475569' }}>
                        {servingChipLabel(serving)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          <Text className="text-center text-[12.5px] mt-4 mb-2" style={{ color: '#9AA3B2' }}>When are you eating this?</Text>
          {MEAL_TYPES.map((meal) => {
            const isActive = meal === mealLabel;
            return (
              <TouchableOpacity
                key={meal}
                onPress={() => onChangeMeal(meal)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                className="flex-row items-center justify-between rounded-2xl px-4 py-3 mb-2"
                style={{
                  borderWidth: isActive ? 1.6 : 1,
                  borderColor: isActive ? '#007BFF' : '#EEF0F4',
                  backgroundColor: isActive ? '#E7F1FF' : '#FFFFFF',
                }}
              >
                <Text className="font-bold text-base" style={{ color: isActive ? '#007BFF' : '#4B5563' }}>{meal}</Text>
                {isActive && <Ionicons name="checkmark" size={18} color="#007BFF" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          onPress={onConfirm}
          disabled={disabled}
          accessibilityRole="button"
          className="rounded-2xl py-3 items-center mt-1"
          style={{ backgroundColor: disabled ? '#BFDBFE' : '#007BFF' }}
        >
          <Text className="text-white font-bold text-base">Add to {mealLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} disabled={disabled} accessibilityRole="button" className="py-3 items-center">
          <Text className="font-bold text-[13.5px]" style={{ color: '#9AA3B2' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MealServingPicker;
