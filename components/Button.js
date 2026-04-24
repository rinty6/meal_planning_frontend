// Used for "Add", "Next Steps", "Subscribe", "Create Goal" buttons

import React from 'react';
import { TouchableOpacity, Text } from 'react-native';

const Button = ({ title, onPress, variant = 'primary', disabled = false }) => {
  const baseStyle = 'py-3 px-6 rounded-full font-semibold text-center';
  let variantStyle = '';
  if (variant === 'primary') variantStyle = 'bg-primary text-white';
  if (variant === 'secondary') variantStyle = 'bg-border text-textPrimary';
  if (variant === 'error') variantStyle = 'bg-error text-white';
  if (disabled) variantStyle += ' opacity-50';

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} className={`${baseStyle} ${variantStyle}`}>
      <Text className="text-center text-xl text-white">{title}</Text>
    </TouchableOpacity>
  );
};

export default Button;