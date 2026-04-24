import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

type SocialProvider = 'google' | 'apple' | 'facebook';

type AuthSocialButtonsProps = {
  loading?: boolean;
  setLoading?: (value: boolean) => void;
  onError: (title: string, message: string) => void;
  beforeStart?: () => boolean;
  unsafeMetadata?: Record<string, unknown>;
  title?: string;
  showDivider?: boolean;
  disabled?: boolean;
};

const providerConfig: Array<{
  key: SocialProvider;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  backgroundColor: string;
  label: string;
}> = [
  { key: 'google', icon: 'google', backgroundColor: '#ef4444', label: 'Google' },
  { key: 'apple', icon: 'apple', backgroundColor: '#111827', label: 'Apple' },
  { key: 'facebook', icon: 'facebook', backgroundColor: '#2563eb', label: 'Facebook' },
];

const normalizeUnsafeMetadata = (unsafeMetadata?: Record<string, unknown>) => {
  if (!unsafeMetadata) return undefined;

  const normalizedEntries = Object.entries(unsafeMetadata).filter(([, value]) => {
    return String(value ?? '').trim().length > 0;
  });

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
};

const getProviderErrorMessage = (providerLabel: string, error: any) => {
  const code = error?.errors?.[0]?.code;
  const message = error?.errors?.[0]?.message || error?.message || '';

  if (
    code === 'oauth_access_denied' ||
    /cancelled|canceled|dismissed/i.test(message)
  ) {
    return `${providerLabel} sign-in was cancelled.`;
  }

  if (
    code === 'strategy_for_user_invalid' ||
    /disabled|not configured|not enabled|unsupported/i.test(message)
  ) {
    return `${providerLabel} sign-in is not available for this app configuration yet.`;
  }

  return message || `${providerLabel} sign-in failed.`;
};

const AuthSocialButtons = ({
  loading = false,
  setLoading,
  onError,
  beforeStart,
  unsafeMetadata,
  title = 'Or continue with',
  showDivider = true,
  disabled = false,
}: AuthSocialButtonsProps) => {
  const router = useRouter();
  const { startOAuthFlow: googleAuth } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: appleAuth } = useOAuth({ strategy: 'oauth_apple' });
  const { startOAuthFlow: facebookAuth } = useOAuth({ strategy: 'oauth_facebook' });

  const normalizedUnsafeMetadata = normalizeUnsafeMetadata(unsafeMetadata);

  const getAuthFlow = (provider: SocialProvider) => {
    switch (provider) {
      case 'google':
        return googleAuth;
      case 'apple':
        return appleAuth;
      case 'facebook':
        return facebookAuth;
      default:
        return googleAuth;
    }
  };

  const handleSocialAuth = async (provider: SocialProvider, label: string) => {
    if (loading || disabled) return;
    if (beforeStart && !beforeStart()) return;

    try {
      setLoading?.(true);

      const authFlow = getAuthFlow(provider);
      const { createdSessionId, setActive } = await authFlow({
        unsafeMetadata: normalizedUnsafeMetadata,
      });

      if (!createdSessionId || !setActive) {
        onError('Error', `${label} sign-in did not finish correctly.`);
        return;
      }

      await setActive({ session: createdSessionId });
      router.replace('/');
    } catch (error: any) {
      onError('Error', getProviderErrorMessage(label, error));
    } finally {
      setLoading?.(false);
    }
  };

  return (
    <>
      {showDivider ? (
        <View className="flex-row items-center my-6">
          <View className="flex-1 h-[1px] bg-gray-200" />
          <Text className="mx-4 text-gray-400">{title}</Text>
          <View className="flex-1 h-[1px] bg-gray-200" />
        </View>
      ) : null}

      <View className="flex-row justify-center space-x-6 mb-8 gap-4">
        {providerConfig.map((provider) => (
          <TouchableOpacity
            key={provider.key}
            onPress={() => handleSocialAuth(provider.key, provider.label)}
            disabled={loading || disabled}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{
              backgroundColor: provider.backgroundColor,
              opacity: loading || disabled ? 0.45 : 1,
            }}
          >
            <FontAwesome name={provider.icon} size={24} color="white" />
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
};

export default AuthSocialButtons;
