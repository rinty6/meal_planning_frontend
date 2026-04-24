// This component displays the modified successfull message

import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SuccessModalProps {
  visible: boolean;
  message: string;
  onClose: () => void;
}

const SuccessModal = ({ visible, message, onClose }: SuccessModalProps) => {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white w-full max-w-sm rounded-3xl p-6 items-center shadow-2xl">
          
          {/* Blue Circle with Checkmark */}
          <View className="w-16 h-16 bg-primary rounded-full items-center justify-center mb-4">
            <Ionicons name="checkmark" size={32} color="white" />
          </View>

          <Text className="text-xl font-bold text-gray-900 mb-2">Success!</Text>
          <Text className="text-gray-500 text-center mb-6">{message}</Text>

          {/* Button */}
          <TouchableOpacity 
            onPress={onClose} 
            className="bg-primary w-full py-3 rounded-full"
          >
            <Text className="text-white text-center font-bold text-lg">Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default SuccessModal;