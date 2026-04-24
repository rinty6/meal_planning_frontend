// This function allows users to update their inofrmation
// Including name, height, weight, age, activity level and goals

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';
import { markProfileDirty, setCachedProfileDemographics } from '../../../services/profileStore';

const ACTIVITY_LEVELS = [
    { label: 'Sedentary', value: 'sedentary' },
    { label: 'Light', value: 'lightly_active' },
    { label: 'Moderate', value: 'moderately_active' },
    { label: 'Active', value: 'very_active' },
    { label: 'Very Active', value: 'super_active' }
];

const GOALS = [
    { label: 'Lose Weight', value: 'lose_weight' },
    { label: 'Maintain', value: 'maintain' },
    { label: 'Gain Muscle', value: 'gain_muscle' }
];

const EditProfileScreen = () => {
    const router = useRouter();
    const { userId } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [baseDemographics, setBaseDemographics] = useState<any>(null);
    
    // DB State
    const [formData, setFormData] = useState({
        weight: '',
        height: '',
        activityLevel: 'moderately_active',
        goal: 'maintain'
    });

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: "", message: "", onConfirm: () => {} });

    useEffect(() => {
        const fetchCurrentData = async () => {
            try {
                const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
                const res = await fetch(`${apiURL}/api/profile/${userId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.demographics) {
                        setBaseDemographics(data.demographics);
                        if (userId) {
                            setCachedProfileDemographics(userId, data.demographics);
                        }
                        setFormData({
                            weight: String(data.demographics.weight || ''),
                            height: String(data.demographics.height || ''),
                            activityLevel: data.demographics.activityLevel || 'moderately_active',
                            goal: data.demographics.goal || 'maintain'
                        });
                    }
                }
            } catch (error) {
                console.error("Fetch error:", error);
            } finally {
                setLoading(false);
            }
        };
        if (userId) fetchCurrentData();
    }, [userId]);

    const handleSave = async () => {
        if (!formData.weight || !formData.height) {
            setAlertConfig({ title: "Validation Error", message: "Please fill out weight and height.", onConfirm: () => setAlertVisible(false) });
            setAlertVisible(true);
            return;
        }

        setSaving(true);
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            const response = await fetch(`${apiURL}/api/profile/update/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData) 
            });

            if (response.ok) {
                if (userId) {
                    if (baseDemographics) {
                        setCachedProfileDemographics(userId, {
                            ...baseDemographics,
                            weight: Number(formData.weight) || formData.weight,
                            height: Number(formData.height) || formData.height,
                            activityLevel: formData.activityLevel,
                            goal: formData.goal,
                        });
                    } else {
                        markProfileDirty(userId);
                    }
                }
                setAlertConfig({ 
                    title: "Success! 🎉", 
                    message: "Your physical profile has been updated.", 
                    onConfirm: () => { setAlertVisible(false); router.back(); } 
                });
                setAlertVisible(true);
            } else {
                throw new Error("Failed to update database");
            }
        } catch (error) {
            console.error("Save error:", error);
            setAlertConfig({ title: "Error", message: "Could not save profile data. Please try again.", onConfirm: () => setAlertVisible(false) });
            setAlertVisible(true);
        } finally {
            setSaving(false);
        }
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
            <View className="flex-row justify-between items-center px-5 py-4 border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()}>
                    <Text className="text-gray-500 font-bold text-base">Cancel</Text>
                </TouchableOpacity>
                <Text className="text-lg font-bold text-gray-900">Edit Demographics</Text>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color="#007BFF" /> : <Text className="text-primary font-bold text-base">Save</Text>}
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 px-5 pt-6">
                
                <View className="mb-6">
                    <Text className="text-sm font-bold text-gray-600 mb-2">Weight (kg)</Text>
                    <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800" keyboardType="numeric" value={formData.weight} onChangeText={(text) => setFormData({...formData, weight: text})} />
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-bold text-gray-600 mb-2">Height (cm)</Text>
                    <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800" keyboardType="numeric" value={formData.height} onChangeText={(text) => setFormData({...formData, height: text})} />
                </View>

                <View className="mb-6">
                    <Text className="text-sm font-bold text-gray-600 mb-2">Activity Level</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {ACTIVITY_LEVELS.map((level) => (
                            <TouchableOpacity key={level.value} onPress={() => setFormData({...formData, activityLevel: level.value})}
                                className={`px-4 py-2 rounded-full border ${formData.activityLevel === level.value ? 'bg-primary border-primary' : 'bg-white border-gray-300'}`}>
                                <Text className={`${formData.activityLevel === level.value ? 'text-white' : 'text-gray-600'} font-bold text-sm`}>{level.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View className="mb-10">
                    <Text className="text-sm font-bold text-gray-600 mb-2">Primary Goal</Text>
                    <View className="flex-row flex-wrap gap-2">
                        {GOALS.map((g) => (
                            <TouchableOpacity key={g.value} onPress={() => setFormData({...formData, goal: g.value})}
                                className={`px-4 py-2 rounded-full border ${formData.goal === g.value ? 'bg-primary border-primary' : 'bg-white border-gray-300'}`}>
                                <Text className={`${formData.goal === g.value ? 'text-white' : 'text-gray-600'} font-bold text-sm`}>{g.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <CustomAlert visible={alertVisible} title={alertConfig.title} message={alertConfig.message} onConfirm={alertConfig.onConfirm} />
        </SafeAreaView>
    );
};

export default EditProfileScreen;
