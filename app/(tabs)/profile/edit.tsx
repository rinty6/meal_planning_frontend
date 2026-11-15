// This screen lets users update their demographics: weight, height, activity
// level, goal, and (for Female or Other) pregnancy and breastfeeding.
// Age and gender are NOT editable here; both are set during onboarding.

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';
import { type PipState } from '../../../components/pip/PipBird';
import { markProfileDirty, setCachedProfileDemographics } from '../../../services/profileStore';
import { authedFetch } from '../../../services/authedFetch';
// Who sees the pregnancy section. Shared with onboarding step 8 so the two
// screens cannot disagree; the server enforces the same rule regardless.
import { asksAboutPregnancy } from '../../../utils/pregnancyQuestion';

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

// Three states, exactly as stored: true, false, or null ("not stated").
type TriState = boolean | null;

const PREGNANCY_OPTIONS = [
    { key: 'isPregnant', label: 'Pregnant' },
    { key: 'isBreastfeeding', label: 'Breastfeeding' },
] as const;

// Tolerates the field being absent on an older cached profile.
const toTriState = (value: unknown): TriState =>
    value === true ? true : value === false ? false : null;

const EditProfileScreen = () => {
    const router = useRouter();
    const { userId, getToken } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [baseDemographics, setBaseDemographics] = useState<any>(null);
    
    // DB State
    const [formData, setFormData] = useState<{
        weight: string;
        height: string;
        activityLevel: string;
        goal: string;
        isPregnant: TriState;
        isBreastfeeding: TriState;
    }>({
        weight: '',
        height: '',
        activityLevel: 'moderately_active',
        goal: 'maintain',
        isPregnant: null,
        isBreastfeeding: null,
    });

    // Gender is not editable on this screen, so the stored value decides
    // whether the pregnancy section is shown.
    const showPregnancy = asksAboutPregnancy(baseDemographics?.gender);
    const notStated = formData.isPregnant === null && formData.isBreastfeeding === null;

    const [alertVisible, setAlertVisible] = useState(false);
    // `pip` is left undefined for the error/validation alerts so CustomAlert derives
    // the sad bird; only the success case overrides it.
    const [alertConfig, setAlertConfig] = useState<{
        title: string;
        message: string;
        pip?: PipState | "none";
        onConfirm: () => void;
    }>({ title: "", message: "", onConfirm: () => {} });

    useEffect(() => {
        const fetchCurrentData = async () => {
            try {
                const res = await authedFetch(`/api/profile/${userId}`, { getToken, clerkId: userId });
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
                            goal: data.demographics.goal || 'maintain',
                            isPregnant: toTriState(data.demographics.isPregnant),
                            isBreastfeeding: toTriState(data.demographics.isBreastfeeding),
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
            // Pregnancy fields are sent only when the section was shown. For a
            // male user they are simply not sent, so the server leaves them as
            // they are (and forces them to null regardless).
            const { isPregnant, isBreastfeeding, ...rest } = formData;
            const body = showPregnancy ? { ...rest, isPregnant, isBreastfeeding } : rest;

            const response = await authedFetch(`/api/profile/update/${userId}`, {
                method: 'PUT',
                getToken,
                clerkId: userId,
                body: JSON.stringify(body)
            });

            if (response.ok) {
                if (userId) {
                    if (baseDemographics) {
                        // The cache must carry every field that was saved, or the
                        // profile shows stale pregnancy answers until a reload.
                        setCachedProfileDemographics(userId, {
                            ...baseDemographics,
                            weight: Number(formData.weight) || formData.weight,
                            height: Number(formData.height) || formData.height,
                            activityLevel: formData.activityLevel,
                            goal: formData.goal,
                            ...(showPregnancy ? { isPregnant, isBreastfeeding } : {}),
                        });
                    } else {
                        markProfileDirty(userId);
                    }
                }
                setAlertConfig({
                    title: "Success! 🎉",
                    message: "Your physical profile has been updated.",
                    pip: "happy",
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

                <View className="mb-6">
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

                {showPregnancy ? (
                    <View className="mb-10">
                        <Text className="text-sm font-bold text-gray-600 mb-1">Pregnancy & breastfeeding</Text>
                        <Text className="text-xs text-gray-500 mb-3">
                            This changes how much of each food group we suggest, and removes alcohol from your plan.
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                            {PREGNANCY_OPTIONS.map((option) => {
                                const on = formData[option.key] === true;
                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: on }}
                                        // Any tap is an answer. Tapping one chip marks
                                        // the OTHER as answered "no" if it was still
                                        // "not stated", matching onboarding, where
                                        // ticking one box sends false for the other.
                                        onPress={() => {
                                            const other = option.key === 'isPregnant' ? 'isBreastfeeding' : 'isPregnant';
                                            setFormData({
                                                ...formData,
                                                [option.key]: !on,
                                                [other]: formData[other] ?? false,
                                            });
                                        }}
                                        className={`px-4 py-2 rounded-full border ${on ? 'bg-primary border-primary' : 'bg-white border-gray-300'}`}>
                                        <Text className={`${on ? 'text-white' : 'text-gray-600'} font-bold text-sm`}>{option.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                            {/* "Not stated" (both NULL), the same state as skipping
                                step 8 in onboarding. Shown selected whenever nothing
                                has been answered; tapping it clears both answers. */}
                            <TouchableOpacity
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: notStated }}
                                onPress={() => setFormData({ ...formData, isPregnant: null, isBreastfeeding: null })}
                                className={`px-4 py-2 rounded-full border ${notStated ? 'bg-primary border-primary' : 'bg-white border-gray-300'}`}>
                                <Text className={`${notStated ? 'text-white' : 'text-gray-600'} font-bold text-sm`}>Prefer not to say</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <View className="mb-4" />
                )}
            </ScrollView>

            <CustomAlert visible={alertVisible} title={alertConfig.title} message={alertConfig.message} pip={alertConfig.pip} onConfirm={alertConfig.onConfirm} />
        </SafeAreaView>
    );
};

export default EditProfileScreen;
