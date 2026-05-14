import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const guideSections = [
  {
    title: 'Add food to your meal log',
    icon: 'add-circle-outline',
    color: '#007BFF',
    backgroundClass: 'bg-primarySoft',
    steps: [
      'From Home, open Category and tap Add Food.',
      'Choose Search, Add Food Manually, Scan Barcode, or Scan Food.',
      'Review the food details, then tap Add or Save Food.',
      'The food is saved to today\'s meal log and your calories update.',
    ],
  },
  {
    title: 'Use meal planning',
    icon: 'restaurant-outline',
    color: '#FF9500',
    backgroundClass: 'bg-secondarySoft',
    steps: [
      'Open Meal from the home category section.',
      'Pick the date and choose Breakfast, Lunch, or Dinner.',
      'Tap Add on a recommendation to save it to your meal log.',
      'Use Shuffle, Skip, and Love to help the app learn your taste.',
    ],
  },
  {
    title: 'Check what you ate',
    icon: 'layers-outline',
    color: '#10B981',
    backgroundClass: 'bg-successSoft',
    steps: [
      'Open Meal Summary to see foods grouped by breakfast, lunch, and dinner.',
      'Use the plus button in a meal section to add more food to that meal.',
      'Tap plus or minus beside a logged food to adjust the quantity.',
      'Switch dates with the calendar strip at the top.',
    ],
  },
  {
    title: 'Track calorie progress',
    icon: 'flame-outline',
    color: '#EF4444',
    backgroundClass: 'bg-neutralSoft',
    steps: [
      'Check the Home calorie summary for today\'s remaining calories.',
      'Open Calorie Summary for more detailed daily progress.',
      'Set or review your goal in the Calorie area when your target changes.',
      'Use the macro circles to balance protein, carbs, fat, and calories.',
    ],
  },
  {
    title: 'Use the rest of the app',
    icon: 'grid-outline',
    color: '#0B2149',
    backgroundClass: 'bg-primarySoft',
    steps: [
      'Use Shopping to manage foods you plan to buy.',
      'Use Recipe to browse recipe ideas and open recipe details.',
      'Use Profile to edit demographics, notifications, privacy, and feedback.',
      'Keep your profile details updated so recommendations stay useful.',
    ],
  },
];

const quickActions = [
  { label: 'Add food', icon: 'add-circle-outline', color: '#007BFF' },
  { label: 'Plan meals', icon: 'restaurant-outline', color: '#FF9500' },
  { label: 'Review progress', icon: 'analytics-outline', color: '#10B981' },
];

const GuidanceScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-appBackground">
      <View className="flex-row items-center px-5 py-4 border-b border-borderSoft bg-surface">
        <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} className="w-10 h-10 rounded-full bg-neutralSoft items-center justify-center mr-3">
          <Ionicons name="arrow-back" size={22} color="#0B2149" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-textDeep">App Guidance</Text>
          <Text className="text-xs text-textSecondary mt-1">Start here if you are new</Text>
        </View>
      </View>

      <ScrollView className="px-5 pt-5" showsVerticalScrollIndicator={false}>
        <View className="bg-primary rounded-xl p-5 mb-5">
          <View className="flex-row items-center mb-3">
            <View className="w-11 h-11 rounded-xl bg-white/20 items-center justify-center mr-3">
              <Ionicons name="compass-outline" size={24} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-2xl font-bold">Use the app in minutes</Text>
              <Text className="text-white/90 text-sm mt-1 leading-5">
                Follow these steps to log food, use recommendations, and understand your progress.
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row justify-between mb-6">
          {quickActions.map((action) => (
            <View key={action.label} className="w-[31%] bg-surface border border-borderSoft rounded-xl px-2 py-4 items-center">
              <Ionicons name={action.icon as any} size={24} color={action.color} />
              <Text className="text-textPrimary text-xs font-bold mt-2 text-center">{action.label}</Text>
            </View>
          ))}
        </View>

        <Text className="text-2xl font-bold text-textDeep mb-3">Step-by-step guide</Text>

        {guideSections.map((section) => (
          <View key={section.title} className="bg-surface border border-borderSoft rounded-xl p-4 mb-4">
            <View className="flex-row items-center mb-3">
              <View className={`w-11 h-11 rounded-xl items-center justify-center mr-3 ${section.backgroundClass}`}>
                <Ionicons name={section.icon as any} size={22} color={section.color} />
              </View>
              <Text className="flex-1 text-lg font-bold text-textDeep">{section.title}</Text>
            </View>

            {section.steps.map((step, index) => (
              <View key={step} className="flex-row items-start mb-3">
                <View className="w-7 h-7 rounded-full bg-neutralSoft items-center justify-center mr-3 mt-0.5">
                  <Text className="text-xs font-bold text-textDeep">{index + 1}</Text>
                </View>
                <Text className="flex-1 text-sm leading-6 text-textSecondary">{step}</Text>
              </View>
            ))}
          </View>
        ))}

        <View className="bg-secondarySoft border border-borderSoft rounded-xl p-4 mb-10">
          <View className="flex-row items-center mb-2">
            <Ionicons name="bulb-outline" size={20} color="#FF9500" />
            <Text className="ml-2 text-base font-bold text-textDeep">Best first workflow</Text>
          </View>
          <Text className="text-sm leading-6 text-textSecondary">
            Add one food from Home, open Meal Summary to confirm it was logged, then check Home again to see your calorie summary update.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default GuidanceScreen;
