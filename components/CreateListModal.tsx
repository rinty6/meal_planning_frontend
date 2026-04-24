// This component create the function named "Create new list" at the shopping page
import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';

interface CreateListModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

const CreateListModal = ({ visible, onClose, onCreate }: CreateListModalProps) => {
  const [name, setName] = useState('');

  const handleSubmit = () => {
    if (name.trim()) {
      onCreate(name);
      setName('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white w-full rounded-3xl p-6">
          <Text className="text-xl font-bold mb-4 text-center">New Shopping List</Text>
          
          <TextInput 
            placeholder="List Name (e.g. Weekly Groceries)"
            value={name}
            onChangeText={setName}
            className="border-b border-gray-200 py-2 text-lg mb-6"
            autoFocus
          />

          <View className="flex-row gap-4">
            <TouchableOpacity onPress={onClose} className="flex-1 py-3 bg-gray-100 rounded-full">
              <Text className="text-center font-bold text-gray-500">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} className="flex-1 py-3 bg-primary rounded-full">
              <Text className="text-center font-bold text-white">Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CreateListModal;