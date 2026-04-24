import { Text, TouchableOpacity } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface MenuOptionProps {
  title: string;
  onPress: () => void;
}

const MenuOptions = ({title, onPress}: MenuOptionProps) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            className='bg-white border border-blue-500 rounded-2xl p-5 mb-4 flex-row justify-between items-center shadow-sm'
        >
            <Text className='text-lg font-bold text-black'>
                {title}
            </Text>
            <Ionicons name="chevron-forward" size={24} color="black" />
        </TouchableOpacity>
    )
}

export  default MenuOptions;