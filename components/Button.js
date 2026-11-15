// Used for "Add", "Next Steps", "Subscribe", "Create Goal" buttons

import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const Button = ({ title, onPress, variant = 'primary', disabled = false }) => {
  const baseStyle = 'py-3 px-6 rounded-full font-semibold text-center';
  let variantStyle = '';
  if (variant === 'primary') variantStyle = 'bg-primary text-white';
  if (variant === 'secondary') variantStyle = 'bg-border text-textPrimary';
  if (variant === 'error') variantStyle = 'bg-error text-white';
  // White with a blue border and blue text. Added for the onboarding
  // pregnancy step, where "Skip This Step" must look as available as the
  // filled "Finish Steps" button but be visibly the lighter choice.
  if (variant === 'outline') variantStyle = 'bg-white border-2 border-primary';
  if (disabled) variantStyle += ' opacity-50';

  // Every existing variant keeps its white text; only outline needs blue,
  // because white text on its white background would be invisible.
  const textColor = variant === 'outline' ? 'text-primary' : 'text-white';

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} className={`${baseStyle} ${variantStyle}`}>
      <Text className={`text-center text-xl ${textColor}`}>{title}</Text>
    </TouchableOpacity>
  );
};

export default Button;