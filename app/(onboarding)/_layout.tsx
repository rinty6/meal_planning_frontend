import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { View, ActivityIndicator } from 'react-native';


export default function OnboardingLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  // If user is NOT signed in, send them back to Sign In page
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // If signed in, let them see the onboarding screens
  return <Stack screenOptions={{ headerShown: false }} />;
}