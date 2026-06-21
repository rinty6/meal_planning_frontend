import React from 'react';
import { Image, Linking, Modal, Text, TouchableOpacity, View } from 'react-native';

interface FatSecretInfoModalProps {
  visible: boolean;
  title: string;
  description: string;
  note: string;
  onClose: () => void;
  // When true, also credit TheMealDB (ingredient/recipe images & data source).
  mealDb?: boolean;
}

const FATSECRET_ATTRIBUTION_URL = 'https://platform.fatsecret.com';
const FATSECRET_BADGE_URL = 'https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_brand.png';
const THEMEALDB_URL = 'https://www.themealdb.com';

const FatSecretInfoModal = ({
  visible,
  title,
  description,
  note,
  onClose,
  mealDb = false,
}: FatSecretInfoModalProps) => {
  const handleOpenFatSecret = () => {
    Linking.openURL(FATSECRET_ATTRIBUTION_URL).catch(() => {
      // Ignore link-open failures on this informational modal.
    });
  };

  const handleOpenTheMealDb = () => {
    Linking.openURL(THEMEALDB_URL).catch(() => {
      // Ignore link-open failures on this informational modal.
    });
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl">
          <Text className="text-2xl font-bold text-center text-gray-900 mb-3">{title}</Text>
          <Text className="text-gray-500 text-center mb-4 leading-6">{description}</Text>

          {/* Show the FatSecret badge here so users can open the attribution page directly. */}
          <TouchableOpacity
            accessibilityRole="link"
            accessibilityLabel="Open the FatSecret attribution page"
            className="self-center mb-4"
            onPress={handleOpenFatSecret}
          >
            <Image
              source={{ uri: FATSECRET_BADGE_URL }}
              className="w-44 h-8"
              resizeMode="contain"
            />
          </TouchableOpacity>

          {/* TheMealDB credit (ingredient images now; recipe data once integrated). */}
          {mealDb && (
            <View className="mb-4">
              <Text className="text-gray-500 text-center text-sm leading-6">
                Ingredients are also provided by TheMealDB.
              </Text>
              <TouchableOpacity
                accessibilityRole="link"
                accessibilityLabel="Open TheMealDB website"
                className="self-center mt-1"
                onPress={handleOpenTheMealDb}
              >
                <Text className="text-primary font-semibold text-center underline">TheMealDB.com</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text className="text-xs text-gray-400 text-center leading-5 mb-6">{note}</Text>

          <TouchableOpacity onPress={onClose} className="bg-primary py-3 rounded-xl items-center">
            <Text className="text-white font-bold">OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default FatSecretInfoModal;