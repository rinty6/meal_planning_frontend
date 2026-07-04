import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { bootstrapBackendUser, clearBackendBootstrapCache } from '../services/userSync';
import { fetchAndCacheHomeDashboard } from '../services/homeDashboard';
import StartupLoadingAnimation from '../components/StartupLoadingAnimation';

// Max time to spend pre-warming the home dashboard before navigating anyway (fail-open).
const DASHBOARD_PREWARM_TIMEOUT_MS = 4_000;

const PRIVATE_NETWORK_URL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})/i;

const StartScreen = () => {
  const router = useRouter();
  const { isSignedIn, isLoaded, getToken, signOut } = useAuth();
  const { user } = useUser();

  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [startupPhase, setStartupPhase] = useState('Waiting for authentication');
  const [retryNonce, setRetryNonce] = useState(0);

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

      // New users go straight to onboarding (no heavy dashboard there).
      if (!hasOnboarded) {
        updateStartupPhase('Opening onboarding');
        if (!cancelled) {
          router.replace('/(onboarding)');
        }
        return;
      }

      // Returning user: pre-warm the home dashboard cache while the loading animation is
      // still on screen, so the Home screen hydrates instantly with no second white spinner.
      // Bounded + fail-open — a slow/failed dashboard fetch must never block or delay login,
      // and is NOT surfaced as an account error (checklist §4A / E20, E24).
      updateStartupPhase('Preparing your dashboard');
      await Promise.race([
        fetchAndCacheHomeDashboard({
          apiURL,
          userId: user.id,
          getToken,
          fallbackName: user?.firstName,
        }),
        new Promise((resolve) => setTimeout(resolve, DASHBOARD_PREWARM_TIMEOUT_MS)),
      ]);

      updateStartupPhase('Opening the main app');
      if (!cancelled) {
        router.replace('/(tabs)');
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

  return (
    <StartupLoadingAnimation
      startupPhase={startupPhase}
      error={bootstrapError}
      onRetry={handleRetry}
      onSignOut={handleSignOut}
    />
  );
};

export default StartScreen;
