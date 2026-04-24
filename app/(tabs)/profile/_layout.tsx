// This layout file sets up the format of the profile folder
// It allowcates each function at the profile page

import React from 'react';
import { Stack } from 'expo-router';

export default function ProfileLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="feedback" />
            <Stack.Screen name="privacy" />
        </Stack>
    );
}