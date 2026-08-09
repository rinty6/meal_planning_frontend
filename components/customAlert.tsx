// This function will create an alert which allows system to notify message to users

import { Modal, View, Text, TouchableOpacity } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import PipBird, { type PipState } from './pip/PipBird';
import { confirmationType } from './confirmationTypography';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'success';
  /**
   * Overrides the Pip state. Pass 'none' to suppress the bird entirely for a
   * message that is neither a verdict nor a question. Left undefined, it is
   * derived — see resolvePipState below.
   */
  pip?: PipState | 'none';
  onConfirm: () => void;
  onCancel?: () => void; // Optional: If not provided, Cancel button is hidden
}

/**
 * Which bird, if any, an alert should show.
 *
 * Derived rather than passed at each of the ~24 call sites, so every error,
 * permission and validation alert in the app gets the sad bird without touching
 * them individually. Two carve-outs matter:
 *
 *  - A success alert is a win, so it gets the happy bird.
 *  - An alert with a Cancel button is a *question* ("Sign out?", "Delete this
 *    item?"), not a verdict. A sad bird there reads as the app pleading with
 *    the user not to do the thing they just chose to do, so it stays plain.
 */
const resolvePipState = (
  pip: PipState | 'none' | undefined,
  isSuccess: boolean,
  hasCancel: boolean
): PipState | null => {
  if (pip === 'none') return null;
  if (pip) return pip;
  if (isSuccess) return 'happy';
  if (hasCancel) return null;
  return 'sad';
};

const CustomAlert = ({
  visible,
  title,
  message,
  confirmText = "OK",
  cancelText = "Cancel",
  variant = "default",
  pip,
  onConfirm,
  onCancel
}: CustomAlertProps) => {
  const isSuccess = variant === "success";
  const pipState = resolvePipState(pip, isSuccess, !!onCancel);
  const centered = isSuccess || !!pipState;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View className={`bg-white w-full max-w-sm p-6 rounded-3xl shadow-xl ${centered ? "items-center" : ""}`}>
          {pipState ? (
            /* Pip sits above the title. Only mounted while the dialog is open:
               most callers keep this component mounted permanently, so rendering
               the rig unconditionally would animate a hidden bird forever. */
            <View className="items-center justify-end mb-2" style={{ height: 96 }}>
              {visible && <PipBird size={96} state={pipState} />}
            </View>
          ) : (
            isSuccess && (
              <View className="w-16 h-16 bg-primary rounded-full items-center justify-center mb-4">
                <Ionicons name="checkmark" size={32} color="white" />
              </View>
            )
          )}

          {/* Title & Message — shared confirmation type scale. The copy always
              states the outcome, so nothing depends on seeing the animation. */}
          <Text style={confirmationType.title} className="mb-2">{title}</Text>
          <Text style={confirmationType.message} className="mb-6">{message}</Text>

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
