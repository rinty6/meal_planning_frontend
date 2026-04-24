import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface TermsOfServiceProps {
  visible: boolean;
  onClose: () => void;
}

const FATSECRET_ATTRIBUTION_URL = 'https://platform.fatsecret.com';
const FATSECRET_BADGE_URL = 'https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_brand.png';

const TermsOfService: React.FC<TermsOfServiceProps> = ({ visible, onClose }) => {
  // Open attribution links from the legal screen without duplicating inline handlers.
  const handleOpenExternalLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      // Ignore link-open failures on this informational screen.
    });
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent transparent={false}>
      {/* Keep the modal header below the system status bar on first open. */}
      <SafeAreaView className="flex-1 bg-white" edges={["top", "left", "right"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <Text className="text-xl font-bold text-textPrimary flex-1">Terms of Service</Text>
        </View>

        {/* Content */}
        <ScrollView className="flex-1 px-5 py-6" contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Title */}
          <Text className="text-2xl font-bold text-textPrimary mb-2">GoodHealthMate: Terms of Service</Text>
          <Text className="text-sm text-gray-500 mb-6">Effective Date: March 13, 2026</Text>

          {/* Introduction */}
          <Text className="text-base text-textSecondary leading-6 mb-6">
            These Terms of Service ("Terms") are a legal agreement between you and GoodHealthMate ("we," "us," or "our"). They govern your use of the GoodHealthMate mobile application, website, and all related nutritional informatics services (the "Service"). By creating an account, you acknowledge that you have read, understood, and agree to be bound by these Terms.
          </Text>

          {/* Section 1 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">1. The Service: A wellness tool, not a medical device</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">1.1. Informational Scope</Text>
            <Text className="text-sm text-textSecondary leading-6">
              GoodHealthMate is intended solely for general wellness purposes. It provides tools for calorie tracking, macronutrient monitoring, and meal planning to help you maintain a healthy lifestyle.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">1.2. Medical Disclaimer</Text>
            <Text className="text-sm text-textSecondary leading-6">
              <Text className="font-bold">THE SERVICE DOES NOT PROVIDE MEDICAL ADVICE.</Text> We are not a healthcare provider. The Service is not intended for the diagnosis, cure, mitigation, treatment, or prevention of any disease or condition. You should never disregard professional medical advice or delay seeking it because of information provided by the Service.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">1.3. Metabolic Estimates</Text>
            <Text className="text-sm text-textSecondary leading-6">
              Caloric targets (BMR/TDEE) are estimates based on standard mathematical equations. These figures are not clinically validated for individuals with metabolic disorders, eating disorders, or chronic health conditions.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">1.4. User Responsibility</Text>
            <Text className="text-sm text-textSecondary leading-6">
              You are solely responsible for verifying the suitability of any food or recipe suggested by the Service, particularly if you have allergies or medical dietary restrictions.
            </Text>
          </View>

          {/* Section 2 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">2. User accounts and data accuracy</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">2.1. Eligibility</Text>
            <Text className="text-sm text-textSecondary leading-6">
              You must be at least 16 years old to use the Service. Users under 16 require explicit parental consent in accordance with GDPR and CCPA youth protections.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">2.2. Onboarding Data</Text>
            <Text className="text-sm text-textSecondary leading-6">
              To calculate your calorie goals, you must provide your age, gender, weight, and height. You agree to provide accurate and updated information.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">2.3. Account Security</Text>
            <Text className="text-sm text-textSecondary leading-6">
              We utilize Clerk for secure authentication. You are responsible for all activity on your account and must notify us immediately of any unauthorized access.
            </Text>
          </View>

          {/* Section 3 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">3. AI and algorithmic meal planning</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">3.1. Recommendation Logic</Text>
            <Text className="text-sm text-textSecondary leading-6">
              GoodHealthMate uses machine learning to profile your preferences and suggest meal combinations. This profiling is "informational" and used to enhance your user experience.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">3.2. Explainability</Text>
            <Text className="text-sm text-textSecondary leading-6">
              We provide in-app "AI Insights" to explain why specific meals are suggested. These are based on your past habits and chosen goals.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">3.3. Model Limitations</Text>
            <Text className="text-sm text-textSecondary leading-6">
              AI recommendations are generated by a computer and may occasionally be repetitive or unsuitable. We provide a "Shuffle" feature to encourage dietary variety.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">3.4. Safety Defaults</Text>
            <Text className="text-sm text-textSecondary leading-6">
              When personalized data is unavailable, we use a "Safety List" of standard balanced meals curated by nutritional experts.
            </Text>
          </View>

          {/* Section 4 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">4. Third-party data and attribution</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">4.1. FatSecret API</Text>
            <Text className="text-sm text-textSecondary leading-6">
              Our nutritional database is powered by the FatSecret Platform API. Nutritional values for branded and generic foods are sourced from FatSecret.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">4.2. Data Caching</Text>
            <Text className="text-sm text-textSecondary leading-6">
              In compliance with FatSecret's developer terms, we do not store your nutritional data history locally for more than 24 hours without refreshing from the source API, except for storable IDs.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">4.3. Open Food Facts</Text>
            <Text className="text-sm text-textSecondary leading-6 mb-3">
              We use Open Food Facts to help populate certain food product information in the Service, including community-contributed product details, ingredients, nutrition facts, and related images when available.
            </Text>
            <Text className="text-sm text-textSecondary leading-6 mb-3">
              Open Food Facts data is made available under the Open Database License, individual database contents are available under the Database Contents License, and product images are generally made available under the Creative Commons Attribution ShareAlike license, subject to any additional rights that may apply to specific images.
            </Text>
            <Text className="text-sm text-textSecondary leading-6">
              Open Food Facts content is provided on an "as is" basis by its contributors. We do not guarantee that third-party food data is accurate, complete, or suitable for any medical purpose, and you should independently verify product information when it matters to your health, allergies, or dietary restrictions.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">4.4. FatSecret Attribution</Text>
            <Text className="text-sm text-textSecondary leading-6">
              Nutritional information in portions of the Service is provided by the FatSecret Platform API. The attribution badge and attribution link below are displayed to comply with FatSecret Platform API attribution requirements.
            </Text>
            {/* Display the FatSecret badge and the required attribution phrase in-app. */}
            <TouchableOpacity
              accessibilityRole="link"
              accessibilityLabel="Nutrition information provided by fatsecret Platform API"
              className="mt-4 self-start"
              onPress={() => handleOpenExternalLink(FATSECRET_ATTRIBUTION_URL)}
            >
              <Image
                source={{ uri: FATSECRET_BADGE_URL }}
                className="w-56 h-10"
                resizeMode="contain"
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="link"
              className="mt-3 self-start"
              onPress={() => handleOpenExternalLink(FATSECRET_ATTRIBUTION_URL)}
            >
              <Text className="text-sm font-semibold text-primary underline">
                Powered by fatsecret Platform API
              </Text>
            </TouchableOpacity>
          </View>

          {/* Section 5 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">5. Your data rights and privacy</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">5.1. Privacy Policy</Text>
            <Text className="text-sm text-textSecondary leading-6">
              Our collection of your health data is governed by our Privacy Policy. We do not sell your sensitive personal information to third parties.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">5.2. Right to Know</Text>
            <Text className="text-sm text-textSecondary leading-6">
              You have the right to request access to all data we have collected about you since January 1, 2022, regardless of the 12-month lookback period previously allowed under older laws.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">5.3. Data Portability</Text>
            <Text className="text-sm text-textSecondary leading-6">
              Under the EU Data Act and UK GDPR, you may export your meal logs and physical stats in a machine-readable format for use with other services at no cost.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">5.4. Biometric/Neural Data</Text>
            <Text className="text-sm text-textSecondary leading-6">
              We do not currently collect neural data. If you connect a wearable that tracks neurological signals, we will require separate, explicit consent before processing such information.
            </Text>
          </View>

          {/* Section 6 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">6. Subscriptions and cancellation</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">6.1. Click-to-Cancel</Text>
            <Text className="text-sm text-textSecondary leading-6">
              If you purchase a premium Service, your subscription will automatically renew at the disclosed frequency. You may cancel at any time through the Service settings. Cancellation will be as easy as your initial sign-up.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">6.2. Transparency</Text>
            <Text className="text-sm text-textSecondary leading-6">
              All fees, including mandatory processing charges, are disclosed upfront. We do not engage in "drip pricing" or hidden fee practices.
            </Text>
          </View>

          {/* Section 7 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">7. Cybersecurity and vulnerabilities</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">7.1. Vulnerability Reporting</Text>
            <Text className="text-sm text-textSecondary leading-6">
              We maintain a public vulnerability disclosure process. You may report security concerns in English, free of charge, to our security team.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">7.2. Security Updates</Text>
            <Text className="text-sm text-textSecondary leading-6">
              We provide security support for the Service until at least 30 June 2028.
            </Text>
          </View>

          <View className="mb-6">
            <Text className="text-base font-semibold text-gray-800 mb-2">7.3. No Default Passwords</Text>
            <Text className="text-sm text-textSecondary leading-6">
              The Service does not use universal default passwords. Your account security relies on unique, user-defined credentials.
            </Text>
          </View>

          {/* Section 8 */}
          <Text className="text-lg font-bold text-textPrimary mb-3 mt-4">8. Limitation of liability and governing law</Text>

          <View className="mb-4">
            <Text className="text-base font-semibold text-gray-800 mb-2">8.1. Liability Cap</Text>
            <Text className="text-sm text-textSecondary leading-6">
              To the fullest extent permitted by law, GoodHealthMate's liability for any incident related to the Service is limited to the amount paid by you for the Service in the 12 months preceding the claim.
            </Text>
          </View>

          <View className="mb-8">
            <Text className="text-base font-semibold text-gray-800 mb-2">8.2. Governing Law</Text>
            <Text className="text-sm text-textSecondary leading-6">
              These Terms are governed by the laws of your local jurisdiction (e.g., the laws of South Australia for Australian users).
            </Text>
          </View>
        </ScrollView>

        {/* Close Button Footer */}
        <View className="border-t border-gray-200 px-5 py-4 bg-gray-50">
          <TouchableOpacity
            onPress={onClose}
            className="bg-primary py-3 rounded-full items-center"
          >
            <Text className="text-white font-bold text-base">Close</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

export default TermsOfService;
