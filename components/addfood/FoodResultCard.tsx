/**
 * One search result in the Add Food modal (Design 3, canvas "Add Food Search
 * Redesign", top row). A pure function of a FoodCardVM:
 *
 *   Title  + Generic / brand tag
 *   segment chips (AUSNUT only; branded rows have none)
 *   ⚖ Per <serving>
 *   <kJ> kJ · Protein · Fat · Carbs                         [ Add ]
 *
 * Energy is formatted by utils/energy.ts from the stored kcal, so this card,
 * the Summary total and meal_logs.calories all derive from one number.
 */

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { FoodCardVM } from '../../api/addFood/addFoodApi.types';
import { formatGrams } from '../../api/addFood/addFoodApi.mappers';
import { formatEnergy } from '../../utils/energy';

type Props = {
  vm: FoodCardVM;
  onAdd: (vm: FoodCardVM) => void;
  /** True while any save is in flight; every row disables, not just the tapped one (ERROR_LOG 071). */
  disabled: boolean;
};

const TAG_STYLES = {
  generic: { backgroundColor: '#DFF3E6', color: '#1F5F3B' },
  brand: { backgroundColor: '#FFF3C4', color: '#6B4E00' },
} as const;

const FoodResultCard = ({ vm, onAdd, disabled }: Props) => {
  const tag =
    vm.tag.kind === 'generic'
      ? { label: 'Generic', ...TAG_STYLES.generic }
      : vm.tag.kind === 'brand'
        ? { label: vm.tag.name, ...TAG_STYLES.brand }
        : null;

  return (
    <View className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 shadow-sm flex-row justify-between items-center">
      <View className="flex-1 mr-3">
        <View className="flex-row items-center flex-wrap">
          <Text className="text-base font-bold text-black mr-2" style={{ lineHeight: 20 }}>
            {vm.title}
          </Text>
          {tag && (
            <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: tag.backgroundColor }}>
              <Text className="text-[11px] font-semibold" style={{ color: tag.color }} numberOfLines={1}>
                {tag.label}
              </Text>
            </View>
          )}
        </View>

        {vm.chips.length > 0 && (
          <View className="flex-row flex-wrap mt-1.5" style={{ gap: 5 }}>
            {vm.chips.map((chip) => (
              <View key={chip} className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: '#F2F3F5' }}>
                <Text className="text-[11px]" style={{ color: '#374151' }}>
                  {chip}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View className="flex-row items-center mt-1.5">
          <Ionicons name="scale-outline" size={13} color="#6B7280" />
          <Text className="text-gray-500 text-xs ml-1" numberOfLines={1}>
            Per {vm.servingLabel}
          </Text>
        </View>

        <Text className="text-xs mt-1" style={{ color: '#4B5563' }} numberOfLines={1}>
          <Text className="font-bold text-black">{formatEnergy(vm.energyKcal, { withUnit: false })}</Text> kJ
          {'   '}Protein {formatGrams(vm.proteinG)}
          {'   '}Fat {formatGrams(vm.fatG)}
          {'   '}Carbs {formatGrams(vm.carbG)}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => onAdd(vm)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Add ${vm.title}`}
        className={`px-5 py-2 rounded-full ${disabled ? 'bg-blue-300' : 'bg-primary'}`}
      >
        <Text className="text-white font-bold">Add</Text>
      </TouchableOpacity>
    </View>
  );
};

export default React.memo(FoodResultCard);
