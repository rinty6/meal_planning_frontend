// This function helps users to change their password
//
// PASSWORD ERRORS AND OVERLAYS: everything the change-password flow reports
// renders INSIDE its <Modal> — inline text beside the field, or an
// InlineStatusOverlay layered over the sheet. It must never open CustomAlert,
// which is itself a full-screen <Modal>: iOS silently drops the second
// presentation (ERROR_LOG Error 019) or freezes the screen (Error 055), so the
// old code showed no error at all on a wrong password. CustomAlert is still the
// right tool for account deletion and legal links, which run with no Modal open.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';
import InlineStatusOverlay from '../../../components/InlineStatusOverlay';
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

type PasswordErrors = {
    currentPassword?: string;
    newPassword?: string;
    form?: string;
};

/** Success auto-dismisses; lockout waits for the user. */
type PasswordOverlay =
    | { kind: 'success'; message: string }
    | { kind: 'lockout'; message: string };

type ClerkErrorInfo = {
    status?: number;
    code?: string;
    message?: string;
    lockoutSeconds?: number;
};

const readClerkError = (error: unknown): ClerkErrorInfo => {
    const err = error as {
        status?: unknown;
        errors?: { code?: string; message?: string; longMessage?: string; meta?: Record<string, unknown> }[];
    };
    const first = Array.isArray(err?.errors) ? err.errors[0] : undefined;
    const lockout = first?.meta?.lockoutExpiresInSeconds;
    return {
        status: typeof err?.status === 'number' ? err.status : undefined,
        code: first?.code,
        message: first?.longMessage || first?.message,
        lockoutSeconds: typeof lockout === 'number' ? lockout : undefined,
    };
};

/** No HTTP status and no Clerk error body means the request never landed. */
const isTransportFailure = (info: ClerkErrorInfo) => info.status === undefined && info.code === undefined;

const describeLockout = (seconds?: number) => {
    if (!seconds || seconds <= 0) return 'For your security, try again shortly. Nothing has changed on your account.';
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `For your security, try again in ${minutes} minute${minutes === 1 ? '' : 's'}. Nothing has changed on your account.`;
};

const PrivacyScreen = () => {
    const router = useRouter();
    const { user, isLoaded: userLoaded, isSignedIn } = useUser();
    const { getToken, signOut, userId } = useAuth();
    const [alertVisible, setAlertVisible] = useState(false);
    const [termsModalVisible, setTermsModalVisible] = useState(false);

    // Password Change State
    const [modalVisible, setModalVisible] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [pwdErrors, setPwdErrors] = useState<PasswordErrors>({});
    const [pwdOverlay, setPwdOverlay] = useState<PasswordOverlay | null>(null);

    /**
     * Synchronous double-tap guard. `loading` drives the disabled state, but
     * React batches it — two taps in one frame both pass that check. This ref
     * flips before any await, so it is what actually blocks the second request.
     */
    const changingPasswordRef = useRef(false);

    // Visibility Toggle State
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
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

    const resetPasswordForm = useCallback(() => {
        setCurrentPassword('');
        setNewPassword('');
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setPwdErrors({});
    }, []);

    const closePasswordModal = useCallback(() => {
        setModalVisible(false);
        setPwdOverlay(null);
        resetPasswordForm();
    }, [resetPasswordForm]);

    /** Clearing only the edited field keeps the other error visible while fixing one. */
    const clearPwdError = useCallback((field: keyof PasswordErrors) => {
        setPwdErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    }, []);

    const handleChangePassword = useCallback(async () => {
        if (changingPasswordRef.current) return;

        if (!currentPassword) {
            setPwdErrors({ currentPassword: 'Enter your current password.' });
            return;
        }
        if (!newPassword) {
            setPwdErrors({ newPassword: 'Enter a new password.' });
            return;
        }

        // Never report success against a missing Clerk user. The old code used
        // `user?.updatePassword(...)`, which resolved to undefined and then
        // showed "Success!" for a change that never happened.
        if (!userLoaded) {
            setPwdErrors({ form: 'Still connecting. Try again in a moment.' });
            return;
        }
        if (!isSignedIn || !user) {
            setPwdErrors({ form: 'Your session has expired. Please sign in again.' });
            return;
        }

        changingPasswordRef.current = true;
        setLoading(true);
        setPwdErrors({});

        try {
            await user.updatePassword({
                currentPassword,
                newPassword,
                signOutOfOtherSessions: true,
            });

            // Clear the values before the card shows, so the animation never
            // gates the security-relevant part.
            resetPasswordForm();
            setPwdOverlay({
                kind: 'success',
                message: "Password updated. You're signed out everywhere else.",
            });
        } catch (error: unknown) {
            const info = readClerkError(error);

            // Values are deliberately preserved so a rejection costs nothing.
            if (isTransportFailure(info)) {
                setPwdErrors({ form: 'Could not reach the server. Check your connection and try again.' });
            } else if (info.code === 'user_locked') {
                setPwdOverlay({ kind: 'lockout', message: describeLockout(info.lockoutSeconds) });
            } else if (info.code === 'account_lockout_warning') {
                setPwdErrors({ form: info.message || 'Too many attempts. Your account will be locked shortly.' });
            } else if (info.code === 'form_password_pwned') {
                setPwdErrors({ newPassword: 'This password has appeared in a data breach. Pick something else.' });
            } else if (info.code === 'form_password_incorrect') {
                setPwdErrors({ currentPassword: 'Current password is incorrect.' });
            } else if (info.code?.startsWith('form_password')) {
                setPwdErrors({ newPassword: info.message || 'Choose a stronger password.' });
            } else if (info.status !== undefined && info.status >= 500) {
                setPwdErrors({ form: 'Something went wrong on our end. Please try again in a moment.' });
            } else {
                // Clerk's own message only. Never surface raw status or response objects.
                setPwdErrors({ form: info.message || 'Could not update password. Please try again.' });
            }
        } finally {
            changingPasswordRef.current = false;
            setLoading(false);
        }
    }, [currentPassword, newPassword, userLoaded, isSignedIn, user, resetPasswordForm]);

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
            <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={closePasswordModal}>
                {/* Full-screen root. Overlays mount as its final child so they cover
                    the whole sheet rather than sitting inside the white card. */}
                <View className="flex-1 justify-center bg-black/50 px-5">
                    <View className="bg-white p-6 rounded-3xl shadow-lg">
                        <Text className="text-xl font-bold mb-4">Change Password</Text>

                        {/* Current Password Input with Eye Icon */}
                        <Text className="text-sm font-bold text-gray-600 mb-2">Current Password</Text>
                        <View className={`flex-row items-center bg-gray-50 border rounded-xl px-4 py-1 ${pwdErrors.currentPassword ? 'border-error' : 'border-gray-200'}`}>
                            <TextInput
                                secureTextEntry={!showCurrentPassword}
                                className="flex-1 py-3 text-base"
                                value={currentPassword}
                                onChangeText={(text) => {
                                    setCurrentPassword(text);
                                    clearPwdError('currentPassword');
                                }}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="password"
                            />
                            <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} className="p-2">
                                <Ionicons name={showCurrentPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                        {!!pwdErrors.currentPassword && (
                            <Text className="text-error text-xs mt-1">{pwdErrors.currentPassword}</Text>
                        )}

                        {/* New Password Input with Eye Icon */}
                        <Text className="text-sm font-bold text-gray-600 mb-2 mt-4">New Password</Text>
                        <View className={`flex-row items-center bg-gray-50 border rounded-xl px-4 py-1 ${pwdErrors.newPassword ? 'border-error' : 'border-gray-200'}`}>
                            <TextInput
                                secureTextEntry={!showNewPassword}
                                className="flex-1 py-3 text-base"
                                value={newPassword}
                                onChangeText={(text) => {
                                    setNewPassword(text);
                                    clearPwdError('newPassword');
                                }}
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="newPassword"
                            />
                            <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} className="p-2">
                                <Ionicons name={showNewPassword ? "eye-off" : "eye"} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                        {!!pwdErrors.newPassword && (
                            <Text className="text-error text-xs mt-1">{pwdErrors.newPassword}</Text>
                        )}

                        {!!pwdErrors.form && (
                            <Text className="text-error text-xs mt-3 text-center">{pwdErrors.form}</Text>
                        )}

                        <View className="flex-row justify-end space-x-4 gap-4 mt-6">
                            <TouchableOpacity
                                onPress={closePasswordModal}
                                disabled={loading}
                                className="px-4 py-3"
                            >
                                <Text className="text-gray-500 font-bold">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleChangePassword} disabled={loading} className="bg-primary px-6 py-3 rounded-full">
                                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">Update</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Success auto-dismisses after Pip's full one-shot (>=3s via
                        PIP_MIN_DISMISS_MS), then closes the modal. Lockout is
                        persistent — the user has to acknowledge it. */}
                    <InlineStatusOverlay
                        visible={!!pwdOverlay}
                        variant={pwdOverlay?.kind === 'lockout' ? 'error' : 'success'}
                        title={pwdOverlay?.kind === 'lockout' ? 'Too many attempts' : 'Password updated'}
                        message={pwdOverlay?.message ?? ''}
                        pip={pwdOverlay?.kind === 'lockout' ? 'care' : 'happy'}
                        pipSize={76}
                        autoDismissMs={pwdOverlay?.kind === 'lockout' ? null : 2000}
                        primaryActionLabel={pwdOverlay?.kind === 'lockout' ? 'Got it' : undefined}
                        onPrimaryAction={pwdOverlay?.kind === 'lockout' ? () => setPwdOverlay(null) : undefined}
                        onHide={closePasswordModal}
                    />
                </View>
            </Modal>

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
