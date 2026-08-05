// This component displays the modified successfull message

import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PipBird, { type PipState } from './pip/PipBird';
import { confirmationType } from './confirmationTypography';

interface SuccessModalProps {
  visible: boolean;
  message: string;
  /**
   * Optional Pip state shown in place of the blue checkmark circle.
   * Left undefined, the modal keeps its original checkmark, so every existing
   * caller is unaffected until it opts in.
   */
  pip?: PipState;
  /** Headline above the message. Defaults to the original "Success!". */
  title?: string;
  onClose: () => void;
}

const SuccessModal = ({ visible, message, pip, title = 'Success!', onClose }: SuccessModalProps) => {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className="bg-white w-full max-w-sm rounded-3xl p-6 items-center shadow-2xl">

          {pip ? (
            /* Pip replaces the checkmark. Only mounted while the dialog is open:
               most callers keep this modal mounted permanently, so rendering the
               rig unconditionally would animate a hidden bird forever. Mounting
               on open also replays the one-shot every time. */
            <View className="items-center justify-end mb-2" style={{ height: 104 }}>
              {visible && <PipBird size={104} state={pip} />}
            </View>
          ) : (
            /* Blue Circle with Checkmark */
            <View className="w-16 h-16 bg-primary rounded-full items-center justify-center mb-4">
              <Ionicons name="checkmark" size={32} color="white" />
            </View>
          )}

          {/* The copy always states the outcome, so nothing depends on the
              animation being seen (motion spec + Reduce Motion). Type comes from
              the shared confirmation scale. */}
          <Text style={confirmationType.title} className="mb-2">{title}</Text>
          <Text style={confirmationType.message} className="mb-6">{message}</Text>

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
