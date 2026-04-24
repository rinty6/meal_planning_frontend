import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { primeRecommendations } from '../services/recommendation';
import { bootstrapBackendUser } from '../services/userSync';

const ML_PRIME_TTL_MS = 5 * 60 * 1000;

const StartScreen = () => {
  const router = useRouter();
  const { isSignedIn, isLoaded, getToken, signOut } = useAuth();
  const { user } = useUser();

  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const initializeApp = async () => {
      if (!isLoaded) return;

      if (!isSignedIn) {
        setBootstrapError(null);
        setTimeout(() => router.replace('/(auth)/sign-in'), 0);
        return;
      }

      if (!user?.id) return;

      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!apiURL) {
        if (!cancelled) {
          setBootstrapError('The backend URL is missing from the app configuration.');
        }
        return;
      }

      if (!cancelled) {
        setBootstrapError(null);
      }

      const bootstrapResult = await bootstrapBackendUser({
        apiURL,
        clerkId: user.id,
        getToken,
      });

      if (!bootstrapResult.ok) {
        console.warn(
          'Backend user bootstrap failed:',
          bootstrapResult.payload || bootstrapResult.error
        );

        if (!cancelled) {
          setBootstrapError(
            bootstrapResult.error || 'We could not finish account setup.'
          );
        }
        return;
      }

      const hasOnboarded = Boolean(bootstrapResult.payload?.hasOnboarded);

      if (hasOnboarded) {
        const now = Date.now();
        const appGlobals = globalThis as typeof globalThis & {
          __mlPrimeInFlight?: boolean;
          __mlPrimeLastAt?: number;
        };
        const lastPrimeAt = Number(appGlobals.__mlPrimeLastAt || 0);
        const primeInFlight = Boolean(appGlobals.__mlPrimeInFlight);

        if (!primeInFlight && now - lastPrimeAt >= ML_PRIME_TTL_MS) {
          appGlobals.__mlPrimeInFlight = true;
          void primeRecommendations({ apiURL, clerkId: user.id }).then((ok) => {
            appGlobals.__mlPrimeLastAt = ok ? Date.now() : 0;
          }).finally(() => {
            appGlobals.__mlPrimeInFlight = false;
          });
        }
      }

      if (!cancelled) {
        router.replace(hasOnboarded ? '/(tabs)' : '/(onboarding)');
      }
    };

    void initializeApp();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, retryNonce, router, user?.id]);

  const handleRetry = () => {
    setRetryNonce((value) => value + 1);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  if (bootstrapError) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#fff',
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '700',
            color: '#1f2937',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          Account Setup Needs Attention
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: '#4b5563',
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 24,
          }}
        >
          {bootstrapError}
        </Text>

        <TouchableOpacity
          onPress={handleRetry}
          style={{
            width: '100%',
            borderRadius: 12,
            backgroundColor: '#3b82f6',
            paddingVertical: 14,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: '#fff',
              textAlign: 'center',
              fontSize: 16,
              fontWeight: '700',
            }}
          >
            Retry
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            width: '100%',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#d1d5db',
            backgroundColor: '#fff',
            paddingVertical: 14,
          }}
        >
          <Text
            style={{
              color: '#111827',
              textAlign: 'center',
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            Sign Out
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
      }}
    >
      <ActivityIndicator size="large" color="#007BFF" />
    </View>
  );
};

export default StartScreen;
