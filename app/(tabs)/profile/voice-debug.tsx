// TEMPORARY Phase 2 debug harness for useVoiceRecognition — proves the voice
// engine works in isolation before any real UI is built on top of it.
// Delete this file + its Profile menu entry at the end of Phase 2
// (see claude_memory/app_video/voice-recognition-food-search-feature/BUILD_CHECKLIST.html).

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';

const VoiceDebugScreen = () => {
  const router = useRouter();
  const { state, interimTranscript, finalTranscript, volume, error, start, stop, reset } =
    useVoiceRecognition();

  const statusColor =
    state === 'listening' ? '#EF4444' : state === 'finished' ? '#10B981' : state === 'error' ? '#F97316' : '#6B7280';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-5 pt-3 pb-4 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={26} color="#0B2149" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-[#0B2149]">Voice Debug (Phase 2)</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View className="flex-row items-center mb-6">
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor, marginRight: 8 }} />
          <Text className="text-base font-bold" style={{ color: statusColor }}>
            {state.toUpperCase()}
          </Text>
          {volume !== null && (
            <Text className="text-xs text-gray-400 ml-3">vol: {volume.toFixed(2)}</Text>
          )}
        </View>

        <View className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
          <Text className="text-xs font-bold text-gray-400 uppercase mb-1">Interim transcript</Text>
          <Text className="text-base text-gray-700">{interimTranscript || '—'}</Text>
        </View>

        <View className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
          <Text className="text-xs font-bold text-gray-400 uppercase mb-1">Final transcript</Text>
          <Text className="text-base text-gray-900 font-bold">{finalTranscript || '—'}</Text>
        </View>

        {error && (
          <View className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
            <Text className="text-xs font-bold text-orange-500 uppercase mb-1">Error: {error.type}</Text>
            <Text className="text-sm text-orange-700">{error.message}</Text>
            {error.type === 'permission-denied' && (
              <Text className="text-xs text-orange-500 mt-2">
                canAskAgain: {String(error.canAskAgain)}
              </Text>
            )}
            {error.code && <Text className="text-xs text-orange-400 mt-1">code: {error.code}</Text>}
          </View>
        )}

        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={start}
            disabled={state === 'listening'}
            className="flex-1 bg-[#007BFF] rounded-xl py-4 items-center"
            style={{ opacity: state === 'listening' ? 0.5 : 1 }}
          >
            <Text className="text-white font-bold">Start</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={stop}
            disabled={state !== 'listening'}
            className="flex-1 bg-[#0B2149] rounded-xl py-4 items-center"
            style={{ opacity: state !== 'listening' ? 0.5 : 1 }}
          >
            <Text className="text-white font-bold">Stop</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reset} className="flex-1 bg-gray-200 rounded-xl py-4 items-center">
            <Text className="text-gray-700 font-bold">Reset</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-xs text-gray-400 mt-6 text-center">
          Try: "grilled chicken", "pho", "quinoa", "banh mi", "greek yogurt". Say nothing and tap
          Stop to test the no-speech path. Deny the permission prompt once to test that path.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

export default VoiceDebugScreen;
