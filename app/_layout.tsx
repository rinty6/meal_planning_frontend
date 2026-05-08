import { Stack } from "expo-router";
import '../global.css';
import { ClerkProvider } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()
const CLERK_PUBLISHABLE_KEY_MODE = CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_')
  ? 'live'
  : CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')
    ? 'test'
    : 'unknown'

export default function RootLayout() {
  // Show a readable configuration failure instead of crashing on startup.
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <SafeAreaProvider>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
            backgroundColor: '#ffffff',
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: '#111827',
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            App Configuration Missing
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: '#4b5563',
              textAlign: 'center',
            }}
          >
            EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing from this build. Add it to the EAS
            production environment before creating the next TestFlight build.
          </Text>
          <StatusBar style="dark" />
        </View>
      </SafeAreaProvider>
    );
  }

  // Log only the key mode so release builds can confirm live vs test config safely.
  console.log('[clerk] publishable key mode', CLERK_PUBLISHABLE_KEY_MODE)

  return (
      // Provide stable safe-area insets for screens and modal content.
      <SafeAreaProvider>
      <ClerkProvider tokenCache={tokenCache} publishableKey={CLERK_PUBLISHABLE_KEY}>
        <Stack screenOptions={{headerShown: false}}/>
        <StatusBar style="light" />
      </ClerkProvider>
      </SafeAreaProvider>
)}
