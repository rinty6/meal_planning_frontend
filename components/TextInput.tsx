import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import React from 'react'
import { Ionicons } from '@expo/vector-icons'

// Create an interface that helps system identify the data type
interface TextInputAreaProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  isPassword?: boolean; // Is this a password input? (Triggers the eye icon)
  onTogglePassword?: () => void; // Function to run when eye is clicked
  isPasswordVisible?: boolean;   // Is the text currently visible?
}


// For forms like name, email, password, goal name, calorie target, search.
// We will use this customized textinput
const TextInputArea = ({
  placeholder, 
  value, 
  onChangeText, 
  secureTextEntry = false, 
  keyboardType = 'default',
  isPassword = false, // Default to false
  onTogglePassword,
  isPasswordVisible = false}: TextInputAreaProps) => {
  return (
    <View className="flex-row items-center border border-border rounded-lg px-3 bg-background mb-4">
      <TextInput
        className="flex-1 py-3 text-textPrimary" 
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        placeholderTextColor="#9CA3AF"
      />
      
      {/* Only show this icon if isPassword is true */}
      {isPassword && (
        <TouchableOpacity onPress={onTogglePassword}>
          <Ionicons 
            name={isPasswordVisible ? "eye-off" : "eye"} 
            size={24} 
            color="gray" 
          />
        </TouchableOpacity>
      )}

    </View>
  )
}

export default TextInputArea