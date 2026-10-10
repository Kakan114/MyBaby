import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { AppText } from '@/components/ui/app-text';
import { lightColors, radii, shadows, spacing } from '@/theme/tokens';
import type { MilestoneCategory } from '../domain/milestone-catalog';

const symbols = {
  profile: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  social: { ios: 'face.smiling', android: 'sentiment_satisfied', web: 'sentiment_satisfied' },
  motor: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  communication: { ios: 'message.fill', android: 'chat', web: 'chat' },
  everyday: { ios: 'cup.and.saucer.fill', android: 'local_cafe', web: 'local_cafe' },
  teeth: { ios: 'sparkle', android: 'dentistry', web: 'dentistry' },
  custom: { ios: 'pencil', android: 'edit', web: 'edit' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
} as const satisfies Record<string, ComponentProps<typeof SymbolView>['name']>;

export type MilestoneIconKind = MilestoneCategory | 'profile' | 'custom' | 'calendar' | 'history' | 'chevron' | 'info';

export function MilestoneIcon({ kind, color = lightColors.actionPrimary, size = 24 }: {
  kind: MilestoneIconKind; color?: string; size?: number;
}) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <SymbolView name={symbols[kind]} size={size} tintColor={color} />
  </View>;
}

export function MilestoneNavigationControl({ label, accessibilityLabel = label, kind, disabled, onPress }: {
  label: string; accessibilityLabel?: string; kind: 'calendar' | 'history'; disabled: boolean; onPress(): void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }} accessibilityValue={kind === 'calendar' ? { text: label } : undefined}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.control, pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
    <View style={styles.badge}><MilestoneIcon kind={kind} /></View>
    <AppText variant="bodyLarge" style={styles.label}>{label}</AppText>
    <MilestoneIcon kind="chevron" />
  </Pressable>;
}

const styles = StyleSheet.create({
  control: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, padding: spacing.md,
    borderRadius: radii.xl, borderWidth: 1, borderColor: lightColors.borderStrong,
    backgroundColor: lightColors.surface, ...shadows.subtle },
  badge: { padding: spacing.sm, borderRadius: radii.md, backgroundColor: lightColors.accentSage },
  label: { flex: 1, flexShrink: 1, color: lightColors.textPrimary, fontWeight: '600' },
  pressed: { backgroundColor: lightColors.surfaceMuted }, disabled: { opacity: 0.5 },
});
