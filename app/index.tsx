import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { primeRecommendations } from '../services/recommendation';
import { bootstrapBackendUser, clearBackendBootstrapCache } from '../services/userSync';

const ML_PRIME_TTL_MS = 5 * 60 * 1000;
const STARTUP_STALL_WARNING_MS = 8_000;
const PRIVATE_NETWORK_URL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})/i;

const StartScreen = () => {
  const router = useRouter();
  const { isSignedIn, isLoaded, getToken, signOut } = useAuth();
  const { user } = useUser();

  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [startupPhase, setStartupPhase] = useState('Waiting for authentication');
  const [showSlowStartupHint, setShowSlowStartupHint] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  // Surface slow startup state so TestFlight users can report where initialization stalls.
  useEffect(() => {
    setShowSlowStartupHint(false);

    const timerId = setTimeout(() => {
      setShowSlowStartupHint(true);
    }, STARTUP_STALL_WARNING_MS);

    return () => {
      clearTimeout(timerId);
    };
  }, [retryNonce, isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const updateStartupPhase = (nextPhase: string) => {
      // Mirror the phase to device logs so TestFlight runs are easier to diagnose.
      console.log('[startup]', nextPhase);
      if (!cancelled) {
        setStartupPhase(nextPhase);
      }
    };

    const initializeApp = async () => {
      if (!isLoaded) {
        updateStartupPhase('Waiting for Clerk to finish loading');
        return;
      }

      if (!isSignedIn) {
        updateStartupPhase('Redirecting to sign in');
        setBootstrapError(null);
        setTimeout(() => router.replace('/(auth)/sign-in'), 0);
        return;
      }

      if (!user?.id) {
        updateStartupPhase('Waiting for signed-in user profile');
        return;
      }

      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!apiURL) {
        updateStartupPhase('Missing backend configuration');
        if (!cancelled) {
          setBootstrapError(
            'EXPO_PUBLIC_BACKEND_URL is missing from this build. Add it to the EAS production environment before creating the next TestFlight build.'
          );
        }
        return;
      }

      // Block release builds that still point at a local development backend.
      if (!__DEV__ && PRIVATE_NETWORK_URL_PATTERN.test(apiURL)) {
        updateStartupPhase('Invalid release backend URL');
        if (!cancelled) {
          setBootstrapError(
            'EXPO_PUBLIC_BACKEND_URL points to a private HTTP address. TestFlight builds need a public HTTPS backend URL in the EAS production environment.'
          );
        }
        return;
      }

      if (!cancelled) {
        setBootstrapError(null);
      }

      updateStartupPhase('Contacting backend account bootstrap');
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
      updateStartupPhase(
        hasOnboarded ? 'Opening the main app' : 'Opening onboarding'
      );

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
    await clearBackendBootstrapCache();
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
        paddingHorizontal: 24,
      }}
    >
      <ActivityIndicator size="large" color="#007BFF" />
      {showSlowStartupHint ? (
        <>
          <Text
            style={{
              marginTop: 20,
              fontSize: 18,
              fontWeight: '600',
              color: '#111827',
              textAlign: 'center',
            }}
          >
            Startup is taking longer than expected
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 14,
              lineHeight: 21,
              color: '#4b5563',
              textAlign: 'center',
            }}
          >
            Current step: {startupPhase}
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            style={{
              marginTop: 20,
              width: '100%',
              borderRadius: 12,
              backgroundColor: '#3b82f6',
              paddingVertical: 14,
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
              Retry Startup
            </Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
};

export default StartScreen;
