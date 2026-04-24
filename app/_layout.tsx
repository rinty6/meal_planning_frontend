import { Stack } from "expo-router";
import '../global.css';
import { ClerkProvider } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout() {
  return (
      // Provide stable safe-area insets for screens and modal content.
      <SafeAreaProvider>
      <ClerkProvider tokenCache={tokenCache} publishableKey={CLERK_PUBLISHABLE_KEY}>
        <Stack screenOptions={{headerShown: false}}/>
        <StatusBar style="light" />
      </ClerkProvider>
      </SafeAreaProvider>
)}
