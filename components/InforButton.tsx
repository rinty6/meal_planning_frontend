// This file creats a component to display extro information
// to help users understand more about the application

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InfoButtonProps {
  onPress: () => void;
}

const InfoButton = ({ onPress }: InfoButtonProps) => {
  return (
    <TouchableOpacity 
      onPress={onPress} 
      className="ml-2 bg-blue-100 rounded-full w-6 h-6 items-center justify-center"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="information" size={16} color="#007BFF" />
    </TouchableOpacity>
  );
};

export default InfoButton;