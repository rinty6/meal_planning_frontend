// This function helps users to change their password
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';
import TermsOfService from '../../../components/TermsOfService';
import { PRIVACY_POLICY_URL } from '../../../utils/config';
import { deleteCurrentAccount } from '../../../services/accountDeletion';
import { clearBackendBootstrapCache } from '../../../services/userSync';

type AlertConfig = {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'success';
    onConfirm: () => void;
    onCancel?: () => void;
};

const PrivacyScreen = () => {
    const router = useRouter();
    const { user } = useUser();
    const { getToken, signOut, userId } = useAuth();
    const [alertVisible, setAlertVisible] = useState(false);
    const [termsModalVisible, setTermsModalVisible] = useState(false);
    
    // Password Change State
    const [modalVisible, setModalVisible] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Visibility Toggle State
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);

    const [pwdAlertConfig, setPwdAlertConfig] = useState<AlertConfig>({
        title: "",
        message: "",
        onConfirm: () => {},
    });

    // Open the public privacy policy page from the profile legal menu.
    const handleOpenPrivacyPolicy = () => {
        if (!PRIVACY_POLICY_URL) {
            setPwdAlertConfig({
                title: 'Missing Configuration',
                message: 'Privacy policy URL is missing from this build configuration.',
                onConfirm: () => setAlertVisible(false),
            });
            setAlertVisible(true);
            return;
        }

        Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
            setPwdAlertConfig({
                title: 'Link Error',
                message: 'Could not open the privacy policy link right now.',
                onConfirm: () => setAlertVisible(false),
            });
            setAlertVisible(true);
        });
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword) {
            setPwdAlertConfig({ title: "Error", message: "Please fill in all fields.", onConfirm: () => setAlertVisible(false) });
            setAlertVisible(true);
            return;
        }

        setLoading(true);
        try {
            await user?.updatePassword({ currentPassword, newPassword });
            setModalVisible(false);
            setPwdAlertConfig({ 
                title: "Success!", 
                message: "Your password has been successfully updated.", 
                confirmText: "Confirm",
                variant: "success",
                onConfirm: () => { 
                    setAlertVisible(false); 
                    setCurrentPassword(''); 
                    setNewPassword(''); 
                    setShowCurrentPassword(false);
                    setShowNewPassword(false);
                } 
            });
            setAlertVisible(true);
        } catch (error: any) {
            setPwdAlertConfig({ 
                title: "Error", 
                message: error.errors?.[0]?.message || "Could not update password. Ensure your current password is correct.", 
                onConfirm: () => setAlertVisible(false) 
            });
            setAlertVisible(true);
        } finally {
            setLoading(false);
        }
    };

    const showDeleteAccountError = (message: string) => {
        setPwdAlertConfig({
            title: "Account Deletion Failed",
            message,
            confirmText: "Close",
            onConfirm: () => setAlertVisible(false),
        });
        setAlertVisible(true);
    };

    const finishDeletedSession = async () => {
        setAlertVisible(false);
        await clearBackendBootstrapCache();
        try {
            await signOut();
        } catch {
            // The account has already been deleted server-side, so local navigation is enough.
        }
        router.replace('/(auth)/sign-in');
    };

    const handleConfirmDeleteAccount = async () => {
        if (deletingAccount) return;

        const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
        if (!apiURL || !userId) {
            setAlertVisible(false);
            showDeleteAccountError("Missing backend configuration or signed-in user id.");
            return;
        }

        setAlertVisible(false);
        setDeletingAccount(true);

        try {
            const result = await deleteCurrentAccount({
                apiURL,
                clerkId: userId,
                getToken,
            });

            if (!result.ok) {
                showDeleteAccountError(result.error || "We could not delete your account right now.");
                return;
            }

            setPwdAlertConfig({
                title: "Account Deleted",
                message: "Your account and app data have been deleted.",
                confirmText: "Confirm",
                variant: "success",
                onConfirm: () => {
                    void finishDeletedSession();
                },
            });
            setAlertVisible(true);
        } catch {
            showDeleteAccountError("Network error while deleting your account.");
        } finally {
            setDeletingAccount(false);
        }
    };

    const handleRequestDeleteAccount = () => {
        setPwdAlertConfig({
            title: "Delete Account",
            message: "This permanently deletes your account, profile, meals, recipes, favorites, shopping lists, notifications, and saved preferences.",
            confirmText: "Delete",
            cancelText: "Cancel",
            onCancel: () => setAlertVisible(false),
            onConfirm: () => {
                void handleConfirmDeleteAccount();
            },
        });
        setAlertVisible(true);
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>
                <Text className="text-xl font-bold flex-1">Privacy & Security</Text>
            </View>

            <View className="px-5 pt-6 space-y-4">
                <TouchableOpacity onPress={() => setModalVisible(true)} className="flex-row items-center justify-between bg-gray-50 p-4 rounded-xl">
                    <Text className="text-base font-bold text-gray-800">Change Password</Text>
                    <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setTermsModalVisible(true)} className="flex-row items-center justify-between bg-gray-50 p-4 rounded-xl mt-4">
                    <Text className="text-base font-bold text-gray-800">Terms of Service</Text>
                    <Ionicons name="open-outline" size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleOpenPrivacyPolicy} className="flex-row items-center justify-between bg-gray-50 p-4 rounded-xl mt-4">
                    <Text className="text-base font-bold text-gray-800">Privacy Policy</Text>
                    <Ionicons name="open-outline" size={20} color="#9CA3AF" />
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleRequestDeleteAccount}
                    disabled={deletingAccount}
                    className="flex-row items-center justify-between bg-red-50 p-4 rounded-xl mt-8 border border-red-100"
                >
                    <View className="flex-row items-center flex-1">
                        <View className="w-10 h-10 rounded-full bg-red-100 items-center justify-center mr-3">
                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-base font-bold text-red-600">Delete Account</Text>
                            <Text className="text-sm text-red-400 mt-1">Permanently remove your account and data</Text>
                        </View>
                    </View>
                    {deletingAccount ? (
                        <ActivityIndicator color="#EF4444" />
                    ) : (
                        <Ionicons name="chevron-forward" size={20} color="#EF4444" />
                    )}
                </TouchableOpacity>
            </View>

            {/* Change Password Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View className="flex-1 justify-center bg-black/50 px-5">
                    <View className="bg-white p-6 rounded-3xl shadow-lg">
                        <Text className="text-xl font-bold mb-4">Change Password</Text>
                        
                        {/* Current Password Input with Eye Icon */}
                        <Text className="text-sm font-bold text-gray-600 mb-2">Current Password</Text>
                        <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-1 mb-4">
                            <TextInput 
                                secureTextEntry={!showCurrentPassword}
                                className="flex-1 py-3 text-base"
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                            />
                            <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} className="p-2">
                                <Ionicons name={showCurrentPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>

                        {/* New Password Input with Eye Icon */}
                        <Text className="text-sm font-bold text-gray-600 mb-2">New Password</Text>
                        <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-1 mb-6">
                            <TextInput 
                                secureTextEntry={!showNewPassword}
                                className="flex-1 py-3 text-base"
                                value={newPassword}
                                onChangeText={setNewPassword}
                            />
                            <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} className="p-2">
                                <Ionicons name={showNewPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row justify-end space-x-4 gap-4">
                            <TouchableOpacity onPress={() => {
                                setModalVisible(false);
                                setCurrentPassword('');
                                setNewPassword('');
                            }} className="px-4 py-3">
                                <Text className="text-gray-500 font-bold">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleChangePassword} disabled={loading} className="bg-primary px-6 py-3 rounded-full">
                                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Update</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <CustomAlert
                visible={alertVisible}
                title={pwdAlertConfig.title}
                message={pwdAlertConfig.message}
                confirmText={pwdAlertConfig.confirmText}
                cancelText={pwdAlertConfig.cancelText}
                variant={pwdAlertConfig.variant}
                onConfirm={pwdAlertConfig.onConfirm}
                onCancel={pwdAlertConfig.onCancel}
            />
            <TermsOfService visible={termsModalVisible} onClose={() => setTermsModalVisible(false)} />
        </SafeAreaView>
    );
};

export default PrivacyScreen;
