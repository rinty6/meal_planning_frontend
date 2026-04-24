// This function will create an alert which allows system to notify message to users

import { Modal, View, Text, TouchableOpacity } from 'react-native';
import React from 'react';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void; // Optional: If not provided, Cancel button is hidden
}

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  confirmText = "OK", 
  cancelText = "Cancel", 
  onConfirm, 
  onCancel 
}: CustomAlertProps) => {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl">
          {/* Title & Message */}
          <Text className="text-xl font-bold text-center text-gray-900 mb-2">{title}</Text>
          <Text className="text-gray-500 text-center mb-6 leading-5">{message}</Text>

          {/* Buttons Row */}
          <View className={`flex-row justify-between w-full ${!onCancel ? 'justify-center' : ''}`}>
            
            {/* Only render Cancel button if onCancel exists */}
            {onCancel && (
              <TouchableOpacity 
                onPress={onCancel} 
                className="flex-1 mr-2 bg-gray-100 py-3 rounded-xl items-center"
              >
                <Text className="text-gray-600 font-bold">{cancelText}</Text>
              </TouchableOpacity>
            )}

            {/* Confirm Button (Always visible) */}
            <TouchableOpacity 
              onPress={onConfirm} 
              className={`bg-primary py-3 rounded-xl items-center ${onCancel ? 'flex-1 ml-2' : 'w-full'}`}
            >
              <Text className="text-white font-bold">{confirmText}</Text>
            </TouchableOpacity>
            
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CustomAlert;