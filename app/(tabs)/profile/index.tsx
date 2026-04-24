// This screen pulls data from Clerk (for auth details) and 
// The backend (for physical stats). It also handles the logout process.

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import CustomAlert from '../../../components/customAlert';
import { getCachedProfileDemographics, setCachedProfileDemographics, shouldRefreshProfile } from '../../../services/profileStore';

const PROFILE_REFRESH_TTL_MS = 60 * 1000;

const ProfileScreen = () => {
    const router = useRouter();
    const { signOut } = useAuth();
    const { user } = useUser();
    
    const [profileData, setProfileData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    
    // Inline Name Editing State
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState(user?.fullName || '');
    const [savingAuthData, setSavingAuthData] = useState(false);

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: "", message: "", isConfirm: false, onConfirm: () => {} });

    const hydrateFromCache = useCallback(() => {
        if (!user?.id) return;
        const cached = getCachedProfileDemographics(user.id);
        if (!cached) return;
        setProfileData(cached.demographics);
        setLoading(false);
    }, [user?.id]);

    const fetchProfileData = useCallback(async ({ showSpinner = true, force = false } = {}) => {
        if (!user?.id) return;
        if (!force && !shouldRefreshProfile(user.id, PROFILE_REFRESH_TTL_MS)) return;
        if (showSpinner) setLoading(true);
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            const res = await fetch(`${apiURL}/api/profile/${user.id}`);
            if (res.ok) {
                const data = await res.json();
                setProfileData(data.demographics);
                setCachedProfileDemographics(user.id, data.demographics);
            }
        } catch (error) {
            console.error("Error loading profile:", error);
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, [user?.id]);

    useFocusEffect(
        useCallback(() => {
            const cached = getCachedProfileDemographics(user?.id);
            hydrateFromCache();
            void fetchProfileData({ showSpinner: !cached });
        }, [fetchProfileData, hydrateFromCache, user?.id])
    );

    // DEPRECATION FIX: Use string array instead of MediaTypeOptions
    const handleUpdateAvatar = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], 
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.3,
            base64: true,
        });

        if (!result.canceled && result.assets[0].base64) {
            setSavingAuthData(true);
            try {
                await user?.setProfileImage({ file: `data:image/jpeg;base64,${result.assets[0].base64}` });
            } catch (error) {
                setAlertConfig({ title: "Error", message: "Failed to update profile picture.", isConfirm: false, onConfirm: () => setAlertVisible(false) });
                setAlertVisible(true);
            } finally {
                setSavingAuthData(false);
            }
        }
    };

    // CLERK: Save Updated Name
    const handleSaveName = async () => {
        if (!tempName.trim()) return;
        setSavingAuthData(true);
        try {
            const nameParts = tempName.trim().split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            await user?.update({ firstName, lastName });
            setIsEditingName(false);
        } catch (error) {
            setAlertConfig({ title: "Error", message: "Failed to update name.", isConfirm: false, onConfirm: () => setAlertVisible(false) });
            setAlertVisible(true);
        } finally {
            setSavingAuthData(false);
        }
    };

    const handleSignOut = () => {
        setAlertConfig({
            title: "Sign Out",
            message: "Are you sure you want to log out of your account?",
            isConfirm: true,
            onConfirm: async () => {
                setAlertVisible(false);
                await signOut();
                router.replace('/(auth)/sign-in');
            }
        });
        setAlertVisible(true);
    };

    if (loading) {
        return (
            <SafeAreaView className="flex-1 bg-white justify-center items-center">
                <ActivityIndicator size="large" color="#007BFF" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-white">
            <ScrollView className="px-5 pt-4" showsVerticalScrollIndicator={false}>
                
                {/* Avatar & Name Section */}
                <View className="items-center mb-8 mt-4">
                    <TouchableOpacity onPress={handleUpdateAvatar} className="relative mb-3">
                        <Image 
                            source={{ uri: user?.imageUrl || 'https://via.placeholder.com/150' }} 
                            className="w-24 h-24 rounded-full border-2 border-primary"
                        />
                        <View className="absolute bottom-0 right-0 bg-primary p-2 rounded-full border-2 border-white">
                            <Ionicons name="camera" size={14} color="white" />
                        </View>
                    </TouchableOpacity>

                    {savingAuthData ? (
                         <ActivityIndicator size="small" color="#007BFF" className="my-2" />
                    ) : isEditingName ? (
                        <View className="flex-row items-center border-b border-primary pb-1 mb-1">
                            <TextInput 
                                className="text-2xl font-bold text-gray-900 px-2 min-w-[150px] text-center"
                                value={tempName}
                                onChangeText={setTempName}
                                autoFocus
                            />
                            <TouchableOpacity onPress={handleSaveName} className="ml-2 bg-primary rounded-full p-1">
                                <Ionicons name="checkmark" size={18} color="white" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View className="flex-row items-center">
                            <Text className="text-2xl font-bold text-gray-900 mr-2">{user?.fullName || 'Aussie Tracker'}</Text>
                            <TouchableOpacity onPress={() => { setTempName(user?.fullName || ''); setIsEditingName(true); }}>
                                <Ionicons name="pencil" size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    )}
                    <Text className="text-gray-500 mt-1">{user?.primaryEmailAddress?.emailAddress}</Text>
                </View>

                {/* Stats Grid */}
                {profileData && (
                    <View className="flex-row justify-between mb-8 bg-gray-50 p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <View className="items-center flex-1 border-r border-gray-200">
                            <Text className="text-xl font-bold text-gray-800">{profileData.weight} kg</Text>
                            <Text className="text-xs text-gray-500 uppercase mt-1">Weight</Text>
                        </View>
                        <View className="items-center flex-1 border-r border-gray-200">
                            <Text className="text-xl font-bold text-gray-800">{profileData.height} cm</Text>
                            <Text className="text-xs text-gray-500 uppercase mt-1">Height</Text>
                        </View>
                        <View className="items-center flex-1">
                            <Text className="text-xl font-bold text-gray-800">{profileData.age}</Text>
                            <Text className="text-xs text-gray-500 uppercase mt-1">Age</Text>
                        </View>
                    </View>
                )}

                {/* Menu Options */}
                <View className="space-y-4 mb-8">
                    <Text className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 ml-2">Account</Text>

                    <TouchableOpacity onPress={() => router.push('/(tabs)/profile/edit')} className="flex-row items-center bg-gray-50 p-4 rounded-xl border border-gray-100 mb-3">
                        <View className="w-10 h-10 bg-blue-100 rounded-full items-center justify-center mr-4">
                            <Ionicons name="body-outline" size={20} color="#007BFF" />
                        </View>
                        <Text className="flex-1 font-bold text-gray-700 text-base">Edit Demographics</Text>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/(tabs)/profile/notifications')} className="flex-row items-center bg-gray-50 p-4 rounded-xl border border-gray-100 mb-3">
                        <View className="w-10 h-10 bg-orange-100 rounded-full items-center justify-center mr-4">
                            <Ionicons name="notifications-outline" size={20} color="#F97316" />
                        </View>
                        <Text className="flex-1 font-bold text-gray-700 text-base">Notifications</Text>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/(tabs)/profile/privacy')} className="flex-row items-center bg-gray-50 p-4 rounded-xl border border-gray-100 mb-3">
                        <View className="w-10 h-10 bg-green-100 rounded-full items-center justify-center mr-4">
                            <Ionicons name="lock-closed-outline" size={20} color="#10B981" />
                        </View>
                        <Text className="flex-1 font-bold text-gray-700 text-base">Privacy & Security</Text>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/(tabs)/profile/feedback')} className="flex-row items-center bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6">
                        <View className="w-10 h-10 bg-purple-100 rounded-full items-center justify-center mr-4">
                            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#8B5CF6" />
                        </View>
                        <Text className="flex-1 font-bold text-gray-700 text-base">Send Feedback</Text>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </TouchableOpacity>

                    <Text className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2 ml-2">Other</Text>

                    <TouchableOpacity onPress={handleSignOut} className="flex-row items-center bg-red-50 p-4 rounded-xl border border-red-100">
                        <View className="w-10 h-10 bg-red-100 rounded-full items-center justify-center mr-4">
                            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                        </View>
                        <Text className="flex-1 font-bold text-red-600 text-base">Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <CustomAlert 
                visible={alertVisible} 
                title={alertConfig.title} 
                message={alertConfig.message} 
                onConfirm={alertConfig.onConfirm}
                onCancel={alertConfig.isConfirm ? () => setAlertVisible(false) : undefined}
            />
        </SafeAreaView>
    );
};

export default ProfileScreen;
