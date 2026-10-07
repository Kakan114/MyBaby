import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { lightColors, radii, spacing } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary';

export type ButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export function Button({
  accessibilityRole,
  accessibilityState,
  children,
  disabled = false,
  style,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled === true;

  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        state.pressed &&
          !isDisabled &&
          (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}>
      <AppText
        variant="label"
        style={[styles.label, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>
        {children}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
  },
  primary: {
    backgroundColor: lightColors.actionPrimary,
  },
  primaryPressed: {
    backgroundColor: lightColors.actionPrimaryPressed,
  },
  secondary: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.borderStrong,
    borderWidth: 1,
  },
  secondaryPressed: {
    backgroundColor: lightColors.surfaceMuted,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  primaryLabel: {
    color: lightColors.actionPrimaryText,
  },
  secondaryLabel: {
    color: lightColors.actionPrimary,
  },
});
