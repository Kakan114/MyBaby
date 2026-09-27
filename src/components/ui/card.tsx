import { StyleSheet, View, type ViewProps } from 'react-native';

import { lightColors, radii, shadows, spacing } from '@/theme/tokens';

export type CardProps = ViewProps;

export function Card({ style, ...props }: CardProps) {
  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadows.subtle,
  },
});
