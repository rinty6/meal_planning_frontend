import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@clerk/clerk-expo';

import AuthSocialButtons from '../../components/AuthSocialButtons';
import Button from '../../components/Button';
import CustomAlert from '../../components/customAlert';
import TermsOfService from '../../components/TermsOfService';
import TextInputArea from '../../components/TextInput';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

const getEmailValidationMessage = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return 'Please enter your email address.';
  }

  if (!EMAIL_REGEX.test(trimmedValue)) {
    return 'Please enter a full email address like name@example.com. Make sure it has one @ symbol, no spaces, and a valid domain such as .com or .com.au.';
  }

  return '';
};

const isInvalidEmailError = (error: any) => {
  const firstError = error?.errors?.[0];
  const code = String(firstError?.code || '');
  const message = String(firstError?.message || '').toLowerCase();

  return (
    code === 'form_param_format_invalid' ||
    code === 'form_param_value_invalid' ||
    code === 'form_identifier_not_valid' ||
    code === 'identifier_not_valid' ||
    (message.includes('invalid') &&
      (message.includes('email') || message.includes('identifier'))) ||
    message.includes('not a valid email') ||
    message.includes('not a valid email address')
  );
};

const isExistingEmailError = (error: any) => {
  const firstError = error?.errors?.[0];
  const code = String(firstError?.code || '');
  const message = String(firstError?.message || '').toLowerCase();

  return (
    code === 'form_identifier_exists' ||
    code === 'identifier_exists' ||
    (message.includes('already') &&
      (message.includes('email') || message.includes('identifier'))) ||
    (message.includes('taken') &&
      (message.includes('email') || message.includes('address')))
  );
};

const SignUpScreen = () => {
  const router = useRouter();
  const { isLoaded, signUp } = useSignUp();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    confirmText: '',
    onConfirm: () => {},
  });

  const showAlert = (
    title: string,
    message: string,
    confirmText?: string,
    onConfirmAction?: () => void
  ) => {
    setAlertConfig({
      title,
      message,
      confirmText: confirmText || 'Continue',
      onConfirm: onConfirmAction || (() => setAlertVisible(false)),
    });
    setAlertVisible(true);
  };

  const handleSignUp = async () => {
    if (!isLoaded) return;

    if (!username || !email || !password || !confirmPassword) {
      showAlert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    const normalizedEmail = email.trim();
    const nextEmailError = getEmailValidationMessage(normalizedEmail);
    if (nextEmailError) {
      showAlert('Invalid Email', nextEmailError, 'OK', () => {
        setAlertVisible(false);
      });
      return;
    }

    if (password.length < 6) {
      showAlert('Warning', 'Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      showAlert('Error', 'Passwords do not match.');
      return;
    }

    if (!agreedToTerms) {
      showAlert(
        'Terms',
        'Please tick the Terms and Conditions box before creating your account.'
      );
      return;
    }

    setLoading(true);

    try {
      const trimmedName = username.trim();

      await signUp.create({
        emailAddress: normalizedEmail,
        password,
        unsafeMetadata: {
          preferredName: trimmedName,
        },
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      router.push({
        pathname: '/(auth)/verify-email',
        params: { email: email.trim() },
      });
    } catch (error: any) {
      if (isExistingEmailError(error)) {
        showAlert(
          'Account Exists',
          'This email has already been used. Please sign in instead.',
          'Login',
          () => {
            setAlertVisible(false);
            router.push('/(auth)/sign-in');
          }
        );
      } else if (isInvalidEmailError(error)) {
        showAlert(
          'Invalid Email',
          getEmailValidationMessage(normalizedEmail) ||
            'Please enter a valid email address like name@example.com.',
          'OK',
          () => {
            setAlertVisible(false);
          }
        );
      } else {
        showAlert(
          'Sign Up Failed',
          error?.errors?.[0]?.message ||
            'We could not create your account. Please check your details and try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        className="bg-background px-6 pt-12"
      >
        <View className="mt-6 mb-8">
          <Text className="text-3xl font-bold text-textPrimary mb-2 text-center">
            Sign up
          </Text>
          <Text className="text-textSecondary text-base text-center">
            Create an account to get started
          </Text>
        </View>

        <View>
          <Text className="font-bold mb-2 ml-1 text-textPrimary">Name</Text>
          <TextInputArea
            placeholder="rinty6"
            value={username}
            onChangeText={setUsername}
          />

          <Text className="font-bold mb-2 ml-1 text-textPrimary">
            Email Address
          </Text>
          <TextInputArea
            placeholder="name@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <Text className="font-bold mb-2 ml-1 text-textPrimary">Password</Text>
          <TextInputArea
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            isPassword={true}
            secureTextEntry={!showPassword}
            isPasswordVisible={showPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
          />

          <TextInputArea
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            isPassword={true}
            secureTextEntry={!showConfirmPassword}
            isPasswordVisible={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
          />
        </View>

        <View className="flex-row items-start mt-2 mb-8 gap-3">
          <TouchableOpacity
            onPress={() => setAgreedToTerms(!agreedToTerms)}
            className="mt-1"
          >
            <View
              className={`w-6 h-6 border rounded items-center justify-center ${
                agreedToTerms
                  ? 'bg-primary border-primary'
                  : 'border-gray-300 bg-white'
              }`}
            >
              {agreedToTerms ? (
                <Ionicons name="checkmark" size={16} color="white" />
              ) : null}
            </View>
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-textSecondary leading-6 flex-row">
              I&apos;ve read and agree with the{' '}
              <TouchableOpacity
                onPress={() => setTermsModalVisible(true)}
                activeOpacity={0.7}
              >
                <Text className="text-primary font-bold underline">
                  Terms and Conditions
                </Text>
              </TouchableOpacity>
            </Text>
          </View>
        </View>

        <Button
          title={loading ? 'Creating Account...' : 'Continue'}
          onPress={handleSignUp}
          disabled={loading}
        />

        <AuthSocialButtons
          loading={loading}
          setLoading={setLoading}
          onError={showAlert}
          title="Or sign up with"
          unsafeMetadata={{
            preferredName: username.trim(),
          }}
        />

        <Text className="text-textSecondary text-sm text-center -mt-4 mb-8 leading-5 px-6">
          Signing up with Google, Apple, or Facebook means you agree to the our terms and conditions
          
        </Text>

        <View className="flex-row justify-center mb-10 mt-2">
          <Text className="text-textSecondary">Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/sign-in')}>
            <Text className="text-primary font-bold">Sign in</Text>
          </TouchableOpacity>
        </View>

        <CustomAlert
          visible={alertVisible}
          title={alertConfig.title}
          message={alertConfig.message}
          confirmText={alertConfig.confirmText}
          onConfirm={alertConfig.onConfirm}
        />

        <TermsOfService
          visible={termsModalVisible}
          onClose={() => setTermsModalVisible(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default SignUpScreen;
