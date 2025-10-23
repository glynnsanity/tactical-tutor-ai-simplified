import React from 'react';
import { TouchableOpacity, Text, ViewStyle, TextStyle } from 'react-native';
import { colors, radii } from '../../theme';

export type ButtonVariant = 'default' | 'outline' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const sizeStyles: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 12 },
  md: { paddingVertical: 12, paddingHorizontal: 16, fontSize: 14 },
  lg: { paddingVertical: 16, paddingHorizontal: 20, fontSize: 16 },
};

export const Button: React.FC<ButtonProps> = ({
  children,
  onPress,
  disabled,
  variant = 'default',
  size = 'md',
  style,
  textStyle,
}) => {
  const base: ViewStyle = {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  };

  const sizing = sizeStyles[size];

  let variantStyle: ViewStyle = {
    backgroundColor: colors.text,
  };
  let variantText: TextStyle = { color: 'white' };

  if (variant === 'outline') {
    variantStyle = { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.cardBorder };
    variantText = { color: colors.text };
  } else if (variant === 'gold') {
    variantStyle = { backgroundColor: colors.coachAccent };
    variantText = { color: '#111827' };
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[base, variantStyle, { paddingVertical: sizing.paddingVertical, paddingHorizontal: sizing.paddingHorizontal, opacity: disabled ? 0.6 : 1 }, style]}
      activeOpacity={0.8}
    >
      <Text style={[{ fontWeight: '600', fontSize: sizing.fontSize }, variantText, textStyle]}>{children}</Text>
    </TouchableOpacity>
  );
};

export default Button;
