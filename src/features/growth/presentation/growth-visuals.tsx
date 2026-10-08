import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { AppText } from '@/components/ui/app-text';
import { lightColors, radii, shadows, spacing } from '@/theme/tokens';

const symbols = {
  weight: { ios: 'scalemass', android: 'monitor_weight', web: 'monitor_weight' },
  length: { ios: 'ruler', android: 'straighten', web: 'straighten' },
  head: { ios: 'face.smiling', android: 'child_care', web: 'child_care' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  history: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  leaf: { ios: 'leaf', android: 'eco', web: 'eco' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
} as const satisfies Record<string, ComponentProps<typeof SymbolView>['name']>;
export function GrowthIcon({ kind, color = lightColors.actionPrimary }: {
  kind: keyof typeof symbols; color?: string;
}) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <SymbolView name={symbols[kind]} size={24} tintColor={color} />
  </View>;
}
export function growthUsesStackedFields(width: number, fontScale: number) {
  return width < 360 || fontScale > 1.3;
}
export function GrowthNavigationControl({ label, accessibilityLabel = label, kind, disabled, onPress, history = false }: {
  label: string; accessibilityLabel?: string; kind: 'calendar' | 'history'; disabled: boolean;
  onPress(): void; history?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }} accessibilityValue={kind === 'calendar' ? { text: label } : undefined} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.control, history ? styles.history : styles.date,
      pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
    <View style={styles.badge}><GrowthIcon kind={kind} /></View>
    <AppText variant="bodyLarge" style={styles.label}>{label}</AppText>
    <GrowthIcon kind="chevron" />
  </Pressable>;
}
const styles = StyleSheet.create({
  control: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64,
    padding: spacing.md, borderRadius: radii.xl, borderWidth: 1 },
  date: { backgroundColor: lightColors.surfaceMuted, borderColor: lightColors.accentSage },
  history: { backgroundColor: lightColors.surface, borderColor: lightColors.borderStrong, ...shadows.subtle },
  badge: { padding: spacing.sm, borderRadius: radii.md, backgroundColor: lightColors.accentSage },
  label: { flex: 1, flexShrink: 1, color: lightColors.textPrimary, fontWeight: '600' },
  pressed: { backgroundColor: lightColors.surfaceMuted }, disabled: { opacity: 0.5 },
});
