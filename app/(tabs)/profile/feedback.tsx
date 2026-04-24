// This file helps users to send feedback to the developer
// They can input their meessanges and upload images

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Image,
    ActivityIndicator,
    ScrollView,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { useAuth, useUser } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';

const FeedbackScreen = () => {
    const router = useRouter();
    const { userId } = useAuth();
    const { user } = useUser();
    const [feedback, setFeedback] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: "", message: "", onConfirm: () => {} });

    // DEPRECATION FIX: Using Array of strings instead of MediaTypeOptions
    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], 
            quality: 0.8,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleSubmit = async () => {
        if (!feedback.trim() && !imageUri) {
            setAlertConfig({ title: "Wait a second", message: "Please type some feedback or attach an image before submitting.", onConfirm: () => setAlertVisible(false) });
            setAlertVisible(true);
            return;
        }
        
        setSubmitting(true);
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            if (!apiURL) {
                throw new Error("Backend URL not configured");
            }

            // Convert image to base64 if present
            let imageBase64 = null;
            if (imageUri) {
                try {
                    const base64String = await readAsStringAsync(imageUri, {
                        encoding: 'base64',
                    });
                    imageBase64 = `data:image/jpeg;base64,${base64String}`;
                } catch (error) {
                    console.error("Error converting image to base64:", error);
                }
            }

            // Send feedback to backend
            const response = await fetch(`${apiURL}/api/feedback/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clerkId: userId,
                    userEmail: user?.emailAddresses?.[0]?.emailAddress || 'noreply@app.com',
                    feedbackText: feedback,
                    imageBase64: imageBase64,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to send feedback");
            }

            // Success
            setAlertConfig({ 
                title: "Thank You!", 
                message: "Your feedback has been sent to developers. We appreciate your help!", 
                onConfirm: () => { 
                    setAlertVisible(false); 
                    setFeedback('');
                    setImageUri(null);
                    router.back();
                } 
            });
            setAlertVisible(true);

        } catch (error) {
            console.error("Error submitting feedback:", error);
            setAlertConfig({ 
                title: "Error", 
                message: error instanceof Error ? error.message : "Failed to send feedback. Please try again.", 
                onConfirm: () => setAlertVisible(false) 
            });
            setAlertVisible(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-white">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
                className="flex-1"
            >
                <View className="flex-row items-center px-5 py-4 border-b border-gray-100">
                    <TouchableOpacity onPress={() => router.back()} className="mr-4">
                        <Ionicons name="arrow-back" size={24} color="black" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold flex-1">Feedback</Text>
                </View>

                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <ScrollView
                        className="flex-1"
                        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 }}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                    >
                        <Text className="text-base text-gray-600 mb-4">
                            Spotted a bug? Have an idea for a new feature? Let us know below!
                        </Text>

                        <TextInput 
                            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-800 h-40 mb-4"
                            placeholder="Type your feedback here..."
                            multiline
                            textAlignVertical="top"
                            value={feedback}
                            onChangeText={setFeedback}
                            blurOnSubmit={false}
                        />

                        {/* Image Attachment Section */}
                        {imageUri ? (
                            <View className="relative mb-6 self-start">
                                <Image source={{ uri: imageUri }} className="w-24 h-40 rounded-xl" />
                                <TouchableOpacity 
                                    onPress={() => setImageUri(null)}
                                    className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
                                >
                                    <Ionicons name="close" size={16} color="white" />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity onPress={pickImage} className="flex-row items-center self-start bg-blue-50 px-4 py-2 rounded-lg mb-6">
                                <Ionicons name="image-outline" size={20} color="#007BFF" />
                                <Text className="text-primary font-bold ml-2">Attach Screenshot</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            onPress={Keyboard.dismiss}
                            className="self-start mb-6"
                            activeOpacity={0.7}
                        >
                            <Text className="text-sm font-semibold text-gray-500">Dismiss keyboard</Text>
                        </TouchableOpacity>

                        <View className="mt-auto pt-4">
                            <TouchableOpacity 
                                onPress={handleSubmit}
                                disabled={submitting}
                                className="bg-primary py-4 rounded-full items-center shadow-sm"
                            >
                                {submitting ? (
                                    <ActivityIndicator color="white" size="large" />
                                ) : (
                                    <Text className="text-white font-bold text-lg">Submit Feedback</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>

            <CustomAlert visible={alertVisible} title={alertConfig.title} message={alertConfig.message} onConfirm={alertConfig.onConfirm} />
        </SafeAreaView>
    );
};

export default FeedbackScreen;
