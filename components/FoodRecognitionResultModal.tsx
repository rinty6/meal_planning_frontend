/**
 * Food recognition result view — rendered as a plain view inside addfoodmodal's
 * viewMode system, not as a Modal or absolute overlay (avoids iOS touch issues).
 *
 * OOD (out-of-distribution) case: shows a "Not Recognised" layout with
 * a prominent search-manually CTA instead of a misleading low-confidence prediction.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PredictionResult, FoodCandidate } from '../services/foodRecognitionAPI';
import { submitFoodFeedback } from '../services/feedbackAPI';

interface Props {
  result: PredictionResult;
  imageUri: string | null;
  onUseFood: (candidate: FoodCandidate) => void;
  onEditDetails: (candidate: FoodCandidate) => void;
  onTryAgain: () => void;
  onSearchManually: () => void;
}

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.9) return '#4CAF50';
  if (confidence >= 0.75) return '#007BFF';
  if (confidence >= 0.6) return '#FF9800';
  return '#F44336';
};

const NutrientBadge = ({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit: string;
}) => (
  <View
    className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 items-center mb-2"
    style={{ width: '48%' }}
  >
    <Text className="text-xs text-gray-400 mb-0.5">{label}</Text>
    <Text className="text-sm font-bold text-black">
      {value}{' '}
      <Text className="text-xs font-normal text-gray-500">{unit}</Text>
    </Text>
  </View>
);

const FeedbackRow = ({
  imageUri,
  predictedClass,
}: {
  imageUri: string | null;
  predictedClass: string;
}) => {
  const [open, setOpen] = useState(false);
  const [correction, setCorrection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!correction.trim()) return;
    setSubmitting(true);
    try {
      await submitFoodFeedback({
        imageUri,
        predictedClass,
        correctClass: correction.trim(),
      });
      setSubmitted(true);
    } catch {
      // fail silently — feedback is best-effort
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View className="flex-row items-center justify-center py-3 mt-2">
        <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
        <Text className="text-sm text-gray-500 ml-2">Thanks for the feedback!</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-center py-3 mt-2"
      >
        <Ionicons name="flag-outline" size={16} color="#9CA3AF" />
        <Text className="text-sm text-gray-400 ml-1">Wrong result? Help us improve</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      className="rounded-xl px-4 py-3 mt-2"
      style={{ backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}
    >
      <Text className="text-sm font-bold text-gray-700 mb-2">What food is this?</Text>
      <View className="flex-row items-center">
        <TextInput
          value={correction}
          onChangeText={setCorrection}
          placeholder="e.g. Banana"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-base mr-2"
          autoCapitalize="words"
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !correction.trim()}
          className="bg-primary rounded-xl px-4 py-2"
          style={{ opacity: correction.trim() ? 1 : 0.4 }}
        >
          {submitting
            ? <ActivityIndicator size="small" color="white" />
            : <Text className="text-white font-bold">Send</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const FoodRecognitionResultModal = ({
  result,
  imageUri,
  onUseFood,
  onEditDetails,
  onTryAgain,
  onSearchManually,
}: Props) => {
  const top = result.top_prediction;
  const confidenceColor = getConfidenceColor(top.confidence);
  const confidencePct = Math.round(top.confidence * 100);
  const isOod = result.ood_detected;

  return (
    <ScrollView
      className="flex-1 px-5 pt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Photo preview */}
      {imageUri && (
        <View className="rounded-2xl overflow-hidden mb-4" style={{ height: 176 }}>
          <Image
            source={{ uri: imageUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
      )}

      {isOod ? (
        /* ── OOD / unrecognised layout ── */
        <>
          <View
            className="rounded-2xl px-5 py-5 mb-3 items-center"
            style={{ backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' }}
          >
            <Ionicons name="help-circle-outline" size={40} color="#F97316" />
            <Text className="text-lg font-bold text-gray-800 mt-2 mb-1">Food Not Recognised</Text>
            <Text className="text-sm text-center" style={{ color: '#9A3412' }}>
              The app could not identify this food. We will continue to improve it. Sorry for this inconvenience.
            </Text>
          </View>

          <TouchableOpacity
            onPress={onSearchManually}
            className="bg-primary w-full py-4 rounded-xl items-center flex-row justify-center mb-3"
          >
            <Ionicons name="search-outline" size={20} color="white" />
            <Text className="text-white font-bold text-lg ml-2">Search Food Manually</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onEditDetails(top)}
            className="w-full py-4 rounded-xl items-center flex-row justify-center mb-3"
            style={{ borderWidth: 1.5, borderColor: '#007BFF' }}
          >
            <Ionicons name="create-outline" size={18} color="#007BFF" />
            <Text className="text-primary font-bold text-base ml-2">Add Details Manually</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onTryAgain}
            className="w-full py-4 rounded-xl items-center flex-row justify-center"
            style={{ borderWidth: 1.5, borderColor: '#E5E7EB' }}
          >
            <Ionicons name="refresh-outline" size={18} color="#9CA3AF" />
            <Text className="text-gray-400 font-bold text-base ml-2">Try Again with Better Photo</Text>
          </TouchableOpacity>

          <FeedbackRow imageUri={imageUri} predictedClass={top.class_name} />
        </>
      ) : (
        /* ── Normal recognised layout ── */
        <>
          {/* Top prediction card */}
          <View className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-3">
            <Text className="text-2xl font-bold text-black mb-1">{top.display_name}</Text>

            <View className="flex-row items-center mb-4">
              <View className="flex-1 bg-gray-200 rounded-full mr-3" style={{ height: 8 }}>
                <View
                  style={{
                    height: 8,
                    width: `${confidencePct}%`,
                    backgroundColor: confidenceColor,
                    borderRadius: 99,
                  }}
                />
              </View>
              <Text className="text-sm font-bold" style={{ color: confidenceColor }}>
                {confidencePct}% match
              </Text>
            </View>

            {top.nutrition ? (
              <>
                <View className="flex-row flex-wrap justify-between">
                  {top.nutrition.calories != null && (
                    <NutrientBadge label="Calories" value={Math.round(top.nutrition.calories)} unit="kcal" />
                  )}
                  {top.nutrition.protein_g != null && (
                    <NutrientBadge label="Protein" value={top.nutrition.protein_g.toFixed(1)} unit="g" />
                  )}
                  {top.nutrition.carbs_g != null && (
                    <NutrientBadge label="Carbs" value={top.nutrition.carbs_g.toFixed(1)} unit="g" />
                  )}
                  {top.nutrition.fat_g != null && (
                    <NutrientBadge label="Fat" value={top.nutrition.fat_g.toFixed(1)} unit="g" />
                  )}
                </View>
                {top.nutrition.serving_description && (
                  <Text className="text-gray-400 text-xs mt-1">
                    Per: {top.nutrition.serving_description}
                  </Text>
                )}
              </>
            ) : (
              <Text className="text-gray-400 text-sm">Nutrition data unavailable</Text>
            )}
          </View>

          {/* Alternatives */}
          {result.alternatives.length > 0 && (
            <View className="mb-2">
              <Text className="text-gray-700 font-bold mb-2">Other Possibilities</Text>
              {result.alternatives.map((alt) => (
                <TouchableOpacity
                  key={alt.class_name}
                  onPress={() => onUseFood(alt)}
                  className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between"
                >
                  <Text className="text-black font-medium flex-1 mr-3">{alt.display_name}</Text>
                  <View className="flex-row items-center">
                    <Text className="text-gray-400 text-sm mr-3">
                      {Math.round(alt.confidence * 100)}%
                    </Text>
                    <Text className="text-primary text-sm font-bold">Use</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <TouchableOpacity
            onPress={() => onUseFood(top)}
            className="bg-primary w-full py-4 rounded-xl items-center mt-2 flex-row justify-center"
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="white" />
            <Text className="text-white font-bold text-lg ml-2">Add to Meal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onEditDetails(top)}
            className="w-full py-4 rounded-xl items-center mt-3 flex-row justify-center"
            style={{ borderWidth: 1.5, borderColor: '#007BFF' }}
          >
            <Ionicons name="create-outline" size={18} color="#007BFF" />
            <Text className="text-primary font-bold text-base ml-2">Edit Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onTryAgain}
            className="w-full py-4 rounded-xl items-center mt-3 flex-row justify-center"
            style={{ borderWidth: 1.5, borderColor: '#E5E7EB' }}
          >
            <Ionicons name="refresh-outline" size={18} color="#9CA3AF" />
            <Text className="text-gray-400 font-bold text-base ml-2">Try Again</Text>
          </TouchableOpacity>

          <FeedbackRow imageUri={imageUri} predictedClass={top.class_name} />
        </>
      )}
    </ScrollView>
  );
};

export default FoodRecognitionResultModal;
