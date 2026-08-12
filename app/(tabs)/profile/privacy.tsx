// Privacy & Security menu: change password, legal links, account deletion.
//
// Change password used to live here as a <Modal>, and that Modal is what made
// ERROR_LOG Error 019 possible — a CustomAlert opened over it was silently
// dropped by iOS, so a wrong password produced no message at all. It is now its
// own route (`change-password.tsx`), which removes the stacking problem
// entirely rather than working around it. CustomAlert stays here for account
// deletion and legal links, which run with no Modal presented.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
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
    const { getToken, signOut, userId } = useAuth();
    const [alertVisible, setAlertVisible] = useState(false);
    const [termsModalVisible, setTermsModalVisible] = useState(false);

    const [deletingAccount, setDeletingAccount] = useState(false);

    const [alertConfig, setAlertConfig] = useState<AlertConfig>({
        title: "",
        message: "",
        onConfirm: () => {},
    });

    // Open the public privacy policy page from the profile legal menu.
    const handleOpenPrivacyPolicy = () => {
        if (!PRIVACY_POLICY_URL) {
            setAlertConfig({
                title: 'Missing Configuration',
                message: 'Privacy policy URL is missing from this build configuration.',
                onConfirm: () => setAlertVisible(false),
            });
            setAlertVisible(true);
            return;
        }

        Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
            setAlertConfig({
                title: 'Link Error',
                message: 'Could not open the privacy policy link right now.',
                onConfirm: () => setAlertVisible(false),
            });
            setAlertVisible(true);
        });
    };

    const showDeleteAccountError = (message: string) => {
        setAlertConfig({
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

            setAlertConfig({
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
        setAlertConfig({
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
        <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
            <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="mr-4">
                    <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>
                <Text className="text-xl font-bold flex-1">Privacy & Security</Text>
            </View>

            <View className="px-5 pt-6 space-y-4">
                <TouchableOpacity onPress={() => router.push('/(tabs)/profile/change-password')} className="flex-row items-center justify-between bg-gray-50 p-4 rounded-xl">
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

            <CustomAlert
                visible={alertVisible}
                title={alertConfig.title}
                message={alertConfig.message}
                confirmText={alertConfig.confirmText}
                cancelText={alertConfig.cancelText}
                variant={alertConfig.variant}
                onConfirm={alertConfig.onConfirm}
                onCancel={alertConfig.onCancel}
            />
            <TermsOfService visible={termsModalVisible} onClose={() => setTermsModalVisible(false)} />
        </SafeAreaView>
    );
};

export default PrivacyScreen;
