// This function will create an alert which allows system to notify message to users

import { Modal, View, Text, TouchableOpacity } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'success';
  onConfirm: () => void;
  onCancel?: () => void; // Optional: If not provided, Cancel button is hidden
}

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  confirmText = "OK", 
  cancelText = "Cancel", 
  variant = "default",
  onConfirm, 
  onCancel 
}: CustomAlertProps) => {
  const isSuccess = variant === "success";

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className={`bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl ${isSuccess ? "items-center" : ""}`}>
          {isSuccess && (
            <View className="w-16 h-16 bg-primary rounded-full items-center justify-center mb-4">
              <Ionicons name="checkmark" size={32} color="white" />
            </View>
          )}

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
              className={`bg-primary py-3 items-center ${isSuccess ? "rounded-full" : "rounded-xl"} ${onCancel ? 'flex-1 ml-2' : 'w-full'}`}
            >
              <Text className={`text-white font-bold ${isSuccess ? "text-lg" : ""}`}>{confirmText}</Text>
            </TouchableOpacity>
            
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CustomAlert;
