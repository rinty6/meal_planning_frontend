/**
 * The refine row under the Add Food search bar (Design 3): a horizontal strip
 * of chips built from the facets the backend computed over the relevant rows.
 *
 *   [✓ All] [Generic] [Branded] [full strength] [mid-strength] [light] …
 *
 * Tapping a segment chip toggles it (chips AND together); Generic/Branded is a
 * single-choice source filter; All clears everything. The row keeps rendering
 * its last chips while a new search loads so the layout does not jump, and it
 * renders nothing until a search has completed at least once.
 */

import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { CatalogSearchResponse, CatalogSource } from '../../api/addFood/addFoodApi.types';

type Props = {
  facets: CatalogSearchResponse['facets'] | null;
  selectedSegments: string[];
  selectedSource: CatalogSource | null;
  onToggleSegment: (label: string) => void;
  onSelectSource: (source: CatalogSource | null) => void;
  onClearAll: () => void;
  disabled: boolean;
};

const Chip = ({ label, selected, onPress, disabled }: { label: string; selected: boolean; onPress: () => void; disabled: boolean }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected, disabled }}
    className="flex-row items-center rounded-full px-3 py-1.5 mr-2"
    style={{ backgroundColor: selected ? '#0B5ED7' : '#F2F3F5', opacity: disabled ? 0.6 : 1 }}
  >
    {selected && <Ionicons name="checkmark" size={12} color="#fff" style={{ marginRight: 5 }} />}
    <Text className="text-xs font-semibold" style={{ color: selected ? '#fff' : '#374151' }} numberOfLines={1}>
      {label}
    </Text>
  </TouchableOpacity>
);

const RefineRow = ({ facets, selectedSegments, selectedSource, onToggleSegment, onSelectSource, onClearAll, disabled }: Props) => {
  if (!facets) return null;
  const hasSources = facets.sources.generic > 0 && facets.sources.branded > 0;
  const segments = facets.segments;
  // With a single source and no segments there is nothing to refine by.
  if (!hasSources && segments.length === 0 && selectedSegments.length === 0 && !selectedSource) return null;

  const nothingSelected = selectedSegments.length === 0 && !selectedSource;

  return (
    <View className="mb-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingRight: 8 }}>
        <Chip label="All" selected={nothingSelected} onPress={onClearAll} disabled={disabled} />
        {(hasSources || selectedSource) && (
          <>
            <Chip
              label="Generic"
              selected={selectedSource === 'generic'}
              onPress={() => onSelectSource(selectedSource === 'generic' ? null : 'generic')}
              disabled={disabled}
            />
            <Chip
              label="Branded"
              selected={selectedSource === 'branded'}
              onPress={() => onSelectSource(selectedSource === 'branded' ? null : 'branded')}
              disabled={disabled}
            />
          </>
        )}
        {/* Selected chips stay visible even when the narrowed facet set no longer lists them, so they can be un-tapped. */}
        {selectedSegments
          .filter((label) => !segments.some((f) => f.label === label))
          .map((label) => (
            <Chip key={`sel-${label}`} label={label} selected onPress={() => onToggleSegment(label)} disabled={disabled} />
          ))}
        {segments.map((facet) => (
          <Chip
            key={facet.value}
            label={facet.label}
            selected={selectedSegments.includes(facet.label)}
            onPress={() => onToggleSegment(facet.label)}
            disabled={disabled}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default RefineRow;
