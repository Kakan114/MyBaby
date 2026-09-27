import { Text, type TextProps } from 'react-native';

import { lightColors, typography } from '@/theme/tokens';

export type AppTextVariant = keyof typeof typography;

export type AppTextProps = TextProps & {
  variant?: AppTextVariant;
};

export function AppText({ style, variant = 'body', ...props }: AppTextProps) {
  return (
    <Text
      style={[typography[variant], { color: lightColors.textPrimary }, style]}
      {...props}
    />
  );
}
