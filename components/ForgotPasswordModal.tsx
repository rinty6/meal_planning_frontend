import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import TextInputArea from './TextInput'; // Adjust path if necessary

interface ForgotPasswordModalProps {
  visible: boolean;
  loading: boolean;
  onClose: () => void;
  onRequestCode: (email: string) => Promise<boolean>; // New prop to handle sending the email
  onVerify: (code: string, newPassword: string) => void;
}

const ForgotPasswordModal = ({ visible, loading, onClose, onRequestCode, onVerify }: ForgotPasswordModalProps) => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  
  // This state controls which step of the modal we are on
  const [isCodeSent, setIsCodeSent] = useState(false);

  // When the modal opens or closes, reset everything to default
  useEffect(() => {
    if (visible) {
      setEmail("");
      setCode("");
      setNewPassword("");
      setIsCodeSent(false);
    }
  }, [visible]);

  const handleSendCodeClick = async () => {
    // Wait for the parent (sign-in.tsx) to tell Clerk to send the code
    const success = await onRequestCode(email);
    // If successful, move to Step 2
    if (success) {
      setIsCodeSent(true);
    }
  };

  const handleUpdateClick = () => {
    onVerify(code, newPassword);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View className="flex-1 justify-center bg-black/50 px-6">
        <View className="bg-white p-6 rounded-3xl shadow-xl">
          <Text className="text-2xl font-bold mb-2 text-center text-textPrimary">Reset Password</Text>
          
          {/* CONDITION: If the code has NOT been sent yet (STEP 1) */}
          {!isCodeSent ? (
            <>
              <Text className="text-textSecondary mb-6 text-center">
                Enter your email address below to receive a password reset code.
              </Text>
              
              <TextInputArea
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              
              <View className="flex-row justify-between mt-4 gap-4">
                <TouchableOpacity onPress={onClose} className="flex-1 bg-gray-100 py-3 rounded-xl items-center">
                  <Text className="font-bold text-gray-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendCodeClick} disabled={loading} className="flex-1 bg-primary py-3 rounded-xl items-center">
                  <Text className="font-bold text-white">{loading ? "Sending..." : "Send Code"}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            /* CONDITION: If the code HAS been sent (STEP 2) */
            <>
              <Text className="text-textSecondary mb-6 text-center">
                Check your email! Enter the verification code we sent to <Text className="font-bold">{email}</Text> along with your new password.
              </Text>
              
              <TextInputArea
                placeholder="Verification Code"
                value={code}
                onChangeText={setCode}
                keyboardType="numeric"
              />
              <TextInputArea
                placeholder="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                isPassword={true}
                secureTextEntry={true} 
              />
              
              <View className="flex-row justify-between mt-4 gap-4">
                <TouchableOpacity onPress={onClose} className="flex-1 bg-gray-100 py-3 rounded-xl items-center">
                  <Text className="font-bold text-gray-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleUpdateClick} disabled={loading} className="flex-1 bg-primary py-3 rounded-xl items-center">
                  <Text className="font-bold text-white">{loading ? "Saving..." : "Update"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
};

export default ForgotPasswordModal;