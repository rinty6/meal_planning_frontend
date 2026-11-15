import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import Button from '../../components/Button';
import CustomAlert from '../../components/customAlert';
// Who sees step 8. Shared with profile edit so the two cannot disagree.
import { asksAboutPregnancy } from '../../utils/pregnancyQuestion';

type OnboardingData = {
  favorites: string[];
  age: string;
  gender: 'male' | 'female' | 'other' | '';
  weight: string;
  weightUnit: 'kg' | 'lbs';
  height: string;
  heightUnit: 'cm' | 'ft';
  activityLevel:
    | 'lightly_active'
    | 'moderately_active'
    | 'very_active'
    | 'super_active'
    | '';
  goal: 'lose_weight' | 'gain_muscle' | 'maintain' | '';
  // Step 8, the two checkboxes. Plain booleans here; turned into the three
  // stored states (true / false / null) only at submit, in buildPayload.
  isPregnant: boolean;
  isBreastfeeding: boolean;
};

const activities = [
  { name: 'Running', icon: 'walk' },
  { name: 'Walking', icon: 'footsteps' },
  { name: 'Cooking', icon: 'nutrition' },
  { name: 'Cycling', icon: 'bicycle' },
  { name: 'Yoga', icon: 'body' },
  { name: 'Gym', icon: 'barbell' },
];

const fitnessLevels = [
  {
    label: 'Lightly active',
    desc: 'Light exercise 1-3 days/week',
    val: 'lightly_active',
  },
  {
    label: 'Moderately active',
    desc: 'Moderate exercise 3-5 days/week',
    val: 'moderately_active',
  },
  {
    label: 'Very active',
    desc: 'Hard exercise 6-7 days/week',
    val: 'very_active',
  },
  {
    label: 'Super active',
    desc: 'Physical job or 2x training',
    val: 'super_active',
  },
] as const;

const goals = [
  { label: 'Weight loss', val: 'lose_weight', icon: 'scale-outline' },
  { label: 'Gain muscle', val: 'gain_muscle', icon: 'barbell-outline' },
  { label: 'Improve fitness', val: 'maintain', icon: 'heart-outline' },
] as const;

const sanitizeIntegerInput = (value: string, maxDigits = 3) =>
  value.replace(/[^\d]/g, '').slice(0, maxDigits);

const sanitizeDecimalInput = (
  value: string,
  {
    maxIntegerDigits = 3,
    maxDecimalDigits = 1,
  }: {
    maxIntegerDigits?: number;
    maxDecimalDigits?: number;
  } = {}
) => {
  const normalizedValue = value.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const [integerPartRaw = '', ...decimalParts] = normalizedValue.split('.');
  const integerPart = integerPartRaw.slice(0, maxIntegerDigits);
  const decimalPart = decimalParts.join('').slice(0, maxDecimalDigits);

  if (normalizedValue.includes('.')) {
    return decimalPart ? `${integerPart}.${decimalPart}` : `${integerPart}.`;
  }

  return integerPart;
};

const parsePositiveNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const OnboardingScreen = () => {
  const router = useRouter();
  const { getToken, userId } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const [data, setData] = useState<OnboardingData>({
    favorites: [],
    age: '',
    gender: '',
    weight: '',
    weightUnit: 'kg',
    height: '',
    heightUnit: 'cm',
    activityLevel: '',
    goal: '',
    isPregnant: false,
    isBreastfeeding: false,
  });

  // The step count is not fixed any more. It is 7 until step 3 is answered,
  // then 8 for Female or Other, so the counter on steps 3-7 reads "of 8" for
  // them. Before step 3 nothing is known, so "of 7" is the honest default.
  const showPregnancyStep = asksAboutPregnancy(data.gender);
  const totalSteps = showPregnancyStep ? 8 : 7;
  const pregnancyAnswered = data.isPregnant || data.isBreastfeeding;
  // On step 8 with nothing ticked, the primary button IS the skip.
  const isSkipButton = step === 8 && !pregnancyAnswered;

  const showAlert = (message: string) => {
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const updateData = <K extends keyof OnboardingData>(
    key: K,
    value: OnboardingData[K]
  ) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const handleAgeChange = (value: string) => {
    updateData('age', sanitizeIntegerInput(value, 3));
  };

  const handleWeightChange = (value: string) => {
    updateData(
      'weight',
      sanitizeDecimalInput(value, {
        maxIntegerDigits: 3,
        maxDecimalDigits: 1,
      })
    );
  };

  const handleHeightChange = (value: string) => {
    updateData(
      'height',
      sanitizeDecimalInput(value, {
        maxIntegerDigits: data.heightUnit === 'cm' ? 3 : 2,
        maxDecimalDigits: data.heightUnit === 'cm' ? 1 : 1,
      })
    );
  };

  const validateCurrentStep = () => {
    if (step === 1 && data.favorites.length === 0) {
      return 'Please select at least one favorite activity.';
    }

    if (step === 2) {
      const ageValue = Number(data.age);
      if (!data.age) {
        return 'Please enter your age.';
      }
      if (!Number.isInteger(ageValue) || ageValue < 16 || ageValue > 120) {
        return 'Please enter a valid age between 16 and 120.';
      }
    }

    if (step === 3 && !data.gender) {
      return 'Please select your gender.';
    }

    if (step === 4) {
      const weightValue = parsePositiveNumber(data.weight);
      if (!data.weight || !weightValue) {
        return 'Please enter a valid weight number.';
      }
    }

    if (step === 5) {
      const heightValue = parsePositiveNumber(data.height);
      if (!data.height || !heightValue) {
        return 'Please enter a valid height number.';
      }
    }

    if (step === 6 && !data.activityLevel) {
      return 'Please select your activity level.';
    }

    if (step === 7 && !data.goal) {
      return 'Please select your goal.';
    }

    return '';
  };

  const handleNext = async () => {
    const validationMessage = validateCurrentStep();
    if (validationMessage) {
      showAlert(validationMessage);
      return;
    }

    if (step < totalSteps) {
      setStep((prev) => prev + 1);
      return;
    }

    await submitData();
  };

  // The request body. The pregnancy answers become one of three states:
  //   step not shown (male)          -> null, null   ("not stated")
  //   shown, nothing ticked (skipped) -> null, null   ("not stated")
  //   shown, at least one ticked      -> true/false for each box
  // The server applies the same rule again (services/demographicsRules.js),
  // so a male user can never be stored as pregnant even if this is bypassed.
  const buildPayload = () => {
    const answered = showPregnancyStep && pregnancyAnswered;
    return {
      ...data,
      isPregnant: answered ? data.isPregnant : null,
      isBreastfeeding: answered ? data.isBreastfeeding : null,
    };
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  };

  const submitData = async () => {
    setLoading(true);

    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      if (!apiURL) {
        throw new Error('Backend URL is missing in .env');
      }

      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (userId) {
        headers['x-clerk-id'] = userId;
      }

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${apiURL}/api/demographics/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPayload()),
      });

      if (!response.ok) {
        let errorPayload: any = null;
        try {
          errorPayload = await response.json();
        } catch {
          errorPayload = null;
        }

        console.error('Server Error:', errorPayload || response.status);
        throw new Error(
          errorPayload?.error ||
            errorPayload?.code ||
            `Server returned ${response.status}`
        );
      }

      await response.json();
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error(error);
      showAlert(error?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = (name: string) => {
    const current = data.favorites;
    if (current.includes(name)) {
      updateData(
        'favorites',
        current.filter((item) => item !== name)
      );
      return;
    }

    updateData('favorites', [...current, name]);
  };

  const renderNumberStep = ({
    title,
    value,
    onChangeText,
    placeholder,
    helperText,
    keyboardType,
    inputMode,
    maxLength,
  }: {
    title: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    helperText: string;
    keyboardType: 'number-pad' | 'decimal-pad' | 'numeric';
    inputMode: 'numeric' | 'decimal';
    maxLength: number;
  }) => (
    <View className="items-center">
      <Text className="text-2xl font-bold mb-10 text-center">{title}</Text>
      <Text className="text-textSecondary text-sm mb-5 text-center px-8">
        {helperText}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        inputMode={inputMode}
        maxLength={maxLength}
        autoCorrect={false}
        autoCapitalize="none"
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        className="text-5xl font-bold text-center border-b-2 border-primary w-40 pb-3 text-textPrimary"
      />
    </View>
  );

  const renderStep1 = () => (
    <View>
      <Text className="text-2xl font-bold text-center mb-8">
        SELECT YOUR FAVORITE
      </Text>
      <View className="flex-row flex-wrap justify-between">
        {activities.map((activity) => (
          <TouchableOpacity
            key={activity.name}
            onPress={() => toggleFavorite(activity.name)}
            className={`w-[30%] aspect-square mb-4 rounded-full items-center justify-center border-2 ${
              data.favorites.includes(activity.name)
                ? 'bg-primary border-primary'
                : 'bg-gray-100 border-transparent'
            }`}
          >
            <Ionicons
              name={activity.icon as any}
              size={32}
              color={data.favorites.includes(activity.name) ? 'white' : 'black'}
            />
            <Text
              className={`text-xs mt-2 font-semibold ${
                data.favorites.includes(activity.name)
                  ? 'text-white'
                  : 'text-black'
              }`}
            >
              {activity.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderStep2 = () =>
    renderNumberStep({
      title: 'HOW OLD ARE YOU?',
      value: data.age,
      onChangeText: handleAgeChange,
      placeholder: '25',
      helperText: 'Please enter your age in years using numbers only.',
      keyboardType: Platform.OS === 'ios' ? 'number-pad' : 'numeric',
      inputMode: 'numeric',
      maxLength: 3,
    });

  const renderStep3 = () => (
    <View>
      <Text className="text-2xl font-bold text-center mb-8">
        WHAT IS YOUR GENDER?
      </Text>
      {['Male', 'Female', 'Other'].map((genderOption) => (
        <TouchableOpacity
          key={genderOption}
          onPress={() => {
            const gender = genderOption.toLowerCase() as OnboardingData['gender'];
            // The back-navigation edge case from the design: someone answers
            // step 8, goes back here and picks Male. Step 8 then disappears,
            // but its answers would still be sitting in state and be sent.
            // Clear them the moment step 8 stops applying.
            setData((prev) => ({
              ...prev,
              gender,
              ...(asksAboutPregnancy(gender)
                ? {}
                : { isPregnant: false, isBreastfeeding: false }),
            }));
          }}
          className={`p-6 mb-4 rounded-2xl border flex-row justify-between items-center ${
            data.gender === genderOption.toLowerCase()
              ? 'bg-blue-50 border-primary'
              : 'bg-white border-gray-200'
          }`}
        >
          <Text className="text-lg font-semibold">{genderOption}</Text>
          {data.gender === genderOption.toLowerCase() ? (
            <Ionicons name="checkmark-circle" size={24} color="#007BFF" />
          ) : null}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep4 = () => (
    <View className="items-center">
      <Text className="text-2xl font-bold mb-8 text-center">
        HOW MUCH DO YOU WEIGH?
      </Text>
      <View className="flex-row bg-gray-200 rounded-lg p-1 mb-8">
        {['lbs', 'kg'].map((unit) => (
          <TouchableOpacity
            key={unit}
            onPress={() => updateData('weightUnit', unit as OnboardingData['weightUnit'])}
            className={`px-6 py-2 rounded-md border ${
              data.weightUnit === unit
                ? 'bg-white border-primary'
                : 'bg-gray-200 border-transparent'
            }`}
          >
            <Text className="font-bold uppercase">{unit}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {renderNumberStep({
        title: '',
        value: data.weight,
        onChangeText: handleWeightChange,
        placeholder: '70',
        helperText: `Enter your weight in ${data.weightUnit.toUpperCase()}. Decimals are allowed if needed.`,
        keyboardType: Platform.OS === 'ios' ? 'decimal-pad' : 'numeric',
        inputMode: 'decimal',
        maxLength: 5,
      })}
    </View>
  );

  const renderStep5 = () => (
    <View className="items-center">
      <Text className="text-2xl font-bold mb-8 text-center">
        HOW TALL ARE YOU?
      </Text>
      <View className="flex-row bg-gray-200 rounded-lg p-1 mb-8">
        {['ft', 'cm'].map((unit) => (
          <TouchableOpacity
            key={unit}
            onPress={() => {
              updateData('heightUnit', unit as OnboardingData['heightUnit']);
              updateData('height', '');
            }}
            className={`px-6 py-2 rounded-md border ${
              data.heightUnit === unit
                ? 'bg-white border-primary'
                : 'bg-gray-200 border-transparent'
            }`}
          >
            <Text className="font-bold uppercase">{unit}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {renderNumberStep({
        title: '',
        value: data.height,
        onChangeText: handleHeightChange,
        placeholder: data.heightUnit === 'cm' ? '170' : '5.8',
        helperText:
          data.heightUnit === 'cm'
            ? 'Enter your height in centimeters.'
            : 'Enter your height in feet. Decimals are allowed, for example 5.8.',
        keyboardType: Platform.OS === 'ios' ? 'decimal-pad' : 'numeric',
        inputMode: 'decimal',
        maxLength: data.heightUnit === 'cm' ? 5 : 4,
      })}
    </View>
  );

  const renderStep6 = () => (
    <View>
      <Text className="text-2xl font-bold text-center mb-6">
        WHAT&apos;S YOUR FITNESS LEVEL?
      </Text>
      {fitnessLevels.map((level) => (
        <TouchableOpacity
          key={level.val}
          onPress={() =>
            updateData('activityLevel', level.val as OnboardingData['activityLevel'])
          }
          className={`p-5 mb-4 rounded-2xl border ${
            data.activityLevel === level.val
              ? 'bg-blue-50 border-primary'
              : 'bg-white border-gray-200'
          }`}
        >
          <Text className="text-lg font-bold">{level.label}</Text>
          <Text className="text-gray-500 text-sm mt-1">{level.desc}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep7 = () => (
    <View>
      <Text className="text-2xl font-bold text-center mb-8">
        WHAT&apos;S YOUR GOAL?
      </Text>
      {goals.map((goalOption) => (
        <TouchableOpacity
          key={goalOption.val}
          onPress={() => updateData('goal', goalOption.val as OnboardingData['goal'])}
          className={`p-6 mb-4 rounded-2xl border flex-row items-center justify-center gap-4 ${
            data.goal === goalOption.val
              ? 'bg-blue-50 border-primary'
              : 'bg-white border-gray-200'
          }`}
        >
          <Ionicons name={goalOption.icon as any} size={24} color="black" />
          <Text className="text-lg font-semibold">{goalOption.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // Step 8. Copy and behaviour come from the approved design; the cards reuse
  // the gender step's look, including its right-aligned blue tick.
  const pregnancyOptions = [
    { key: 'isPregnant', label: "I'm pregnant", desc: 'More grains and protein.' },
    { key: 'isBreastfeeding', label: "I'm breastfeeding", desc: 'More grains and vegetables.' },
  ] as const;

  const renderStep8 = () => (
    <View>
      <Text className="text-2xl font-bold text-center mb-3">
        ARE YOU PREGNANT OR BREASTFEEDING?
      </Text>
      <Text className="text-textSecondary text-sm text-center mb-8 px-4">
        This changes how much of each food group we suggest, and removes
        alcohol from your plan.
      </Text>
      {pregnancyOptions.map((option) => {
        const checked = data[option.key];
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => updateData(option.key, !checked)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            className={`p-5 mb-4 rounded-2xl border flex-row justify-between items-center ${
              checked ? 'bg-blue-50 border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <View className="flex-1 pr-3">
              <Text className="text-lg font-semibold">{option.label}</Text>
              {checked ? (
                <Text className="text-gray-500 text-sm mt-1">{option.desc}</Text>
              ) : null}
            </View>
            {checked ? (
              <Ionicons name="checkmark-circle" size={24} color="#007BFF" />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const buttonTitle =
    step < totalSteps
      ? 'Next Steps'
      : loading
        ? 'Finishing...'
        : isSkipButton
          ? 'Skip This Step'
          : 'Finish Steps';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        className="px-6 pt-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row justify-between items-center mb-6">
          {step > 1 ? (
            <TouchableOpacity onPress={handleBack}>
              <Ionicons name="chevron-back" size={28} color="black" />
            </TouchableOpacity>
          ) : (
            <View className="w-7" />
          )}

          <Text className="text-primary font-bold">Step {step} of {totalSteps}</Text>
          <View className="w-7" />
        </View>

        <View className="flex-1 justify-center">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
          {step === 6 && renderStep6()}
          {step === 7 && renderStep7()}
          {step === 8 && showPregnancyStep && renderStep8()}
        </View>

        <View className="mb-10 mt-6">
          {step === 8 ? (
            // Read BEFORE the decision, so it sits above the button.
            <Text className="text-gray-500 text-xs text-center mb-3 px-6">
              Answer only if you want to. You can change it any time in your profile.
            </Text>
          ) : null}
          <Button
            title={buttonTitle}
            variant={isSkipButton ? 'outline' : 'primary'}
            onPress={handleNext}
            disabled={loading}
          />
        </View>
      </ScrollView>

      <CustomAlert
        visible={alertVisible}
        title="Attention"
        message={alertMessage || 'An error occurred'}
        onConfirm={() => setAlertVisible(false)}
      />
    </KeyboardAvoidingView>
  );
};

export default OnboardingScreen;
