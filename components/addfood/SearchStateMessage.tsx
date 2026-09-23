/**
 * The honest empty/failure states of the Add Food search list (checklist p3-04).
 *
 * Every state below used to render as either a blank list or "No foods found"
 * (ERROR_LOG 032, 063, 065). Each ApiFailure kind now has its own copy, and
 * "empty" is used ONLY for a successful search with zero rows.
 */

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { ApiFailure } from '../../api/core/request';

type Props = {
  state: { kind: 'empty'; query: string } | { kind: 'failure'; failure: ApiFailure; query: string };
  onRetry: () => void;
  disabled: boolean;
};

/**
 * One set of words per kind of trouble. Exported because the barcode scanner
 * shows the same failures on a different surface, and two copies of this table
 * would drift (checklist b5-07).
 */
export const FAILURE_COPY: Record<ApiFailure['kind'], { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string; retry: boolean }> = {
  throttled: { icon: 'hourglass-outline', title: 'You are searching a bit fast', body: 'Give it a moment and try again.', retry: true },
  offline: { icon: 'cloud-offline-outline', title: "Can't reach GoodHealthMate", body: 'Check your connection and try again.', retry: true },
  timeout: { icon: 'time-outline', title: 'That took too long', body: 'The server did not answer in time. Try again.', retry: true },
  unauthorized: { icon: 'lock-closed-outline', title: 'Please sign in again', body: 'Your session needs a refresh before searching.', retry: false },
  not_found: { icon: 'help-circle-outline', title: 'Search is unavailable', body: 'The food search endpoint could not be found.', retry: false },
  bad_request: { icon: 'alert-circle-outline', title: 'Try a different search', body: 'That search could not be understood. Use a plain food name, e.g. chicken.', retry: false },
  server: { icon: 'warning-outline', title: 'Something went wrong on our side', body: 'The search failed. Try again in a moment.', retry: true },
  aborted: { icon: 'refresh-outline', title: '', body: '', retry: false }, // never rendered: a superseded search shows nothing
};

const SearchStateMessage = ({ state, onRetry, disabled }: Props) => {
  if (state.kind === 'failure' && state.failure.kind === 'aborted') return null;

  const view =
    state.kind === 'empty'
      ? {
          icon: 'search-outline' as const,
          title: `No foods found for “${state.query}”`,
          body: 'Try a simpler word, for example chicken or beer.',
          retry: false,
        }
      : FAILURE_COPY[state.failure.kind];

  return (
    <View className="items-center mt-10 px-6">
      <Ionicons name={view.icon} size={28} color="#9CA3AF" />
      <Text className="text-base font-semibold text-gray-700 mt-3 text-center">{view.title}</Text>
      <Text className="text-sm text-gray-400 mt-1 text-center">{view.body}</Text>
      {view.retry && (
        <TouchableOpacity
          onPress={onRetry}
          disabled={disabled}
          accessibilityRole="button"
          className={`mt-4 px-5 py-2 rounded-full border ${disabled ? 'border-gray-300' : 'border-primary'}`}
        >
          <Text className={`font-bold ${disabled ? 'text-gray-300' : 'text-primary'}`}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default SearchStateMessage;
