import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { lightColors, radii, spacing, typography } from '@/theme/tokens';

export type DashboardKind = 'feeding' | 'sleep' | 'diapers';
const icons = {
  feeding: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  sleep: { ios: 'moon.fill', android: 'bedtime', web: 'bedtime' },
  diapers: { ios: 'teddybear.fill', android: 'child_care', web: 'child_care' },
} as const satisfies Record<DashboardKind, ComponentProps<typeof SymbolView>['name']>;
const backgrounds = {
  feeding: lightColors.accentSage,
  sleep: lightColors.accentBlue,
  diapers: lightColors.accentPeach,
} as const;

export function DashboardIcon({ kind }: Readonly<{ kind: DashboardKind }>) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <SymbolView name={icons[kind]} size={24} tintColor={lightColors.textPrimary} />
  </View>;
}

// Reserve space for scaled labels and unusually long counts; never shrink text to fit.
export function dashboardFitsRow(availableWidth: number, fontScale: number, longestCount: number): boolean {
  const scale = Math.max(1, fontScale);
  const countWidth = String(longestCount).length * typography.headingMedium.fontSize * 0.65 * scale;
  const minimumCardWidth = Math.max(96 * scale, countWidth + spacing.md * 2);
  return availableWidth >= minimumCardWidth * 3 + spacing.sm * 2;
}

export function StatisticCard({ kind, value, label, row }: Readonly<{
  kind: DashboardKind; value: string; label: string; row: boolean;
}>) {
  return <Card testID={`today-stat-${kind}`} style={[
    styles.statistic, { backgroundColor: backgrounds[kind] }, row && styles.column,
  ]} accessible accessibilityLabel={`${label}: ${value}`}>
    <DashboardIcon kind={kind} />
    <AppText variant="headingMedium" style={styles.value}>{value}</AppText>
    <AppText variant="bodySmall" style={styles.label}>{label}</AppText>
  </Card>;
}

export function LatestEventRow({ kind, label, value }: Readonly<{
  kind: DashboardKind; label: string; value: string;
}>) {
  return <View style={styles.event} accessible accessibilityLabel={`${label}: ${value}`}>
    <View style={[styles.eventIcon, { backgroundColor: backgrounds[kind] }]}>
      <DashboardIcon kind={kind} />
    </View>
    <View style={styles.eventText}>
      <AppText variant="bodySmall" style={styles.secondary}>{label}</AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  </View>;
}

export function QuickLogAction({ kind, label, row, onPress }: Readonly<{
  kind: DashboardKind; label: string; row: boolean; onPress: () => void;
}>) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [
      styles.action, row && styles.column,
      { backgroundColor: pressed ? lightColors.surfaceMuted : lightColors.surface },
    ]}>
    <DashboardIcon kind={kind} />
    <AppText variant="label" style={styles.label}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  column: { flex: 1, minWidth: 0 },
  statistic: {
    padding: spacing.md, gap: spacing.sm, minHeight: 136,
    alignItems: 'center', shadowOpacity: 0, elevation: 0,
  },
  value: { textAlign: 'center', alignSelf: 'stretch' },
  label: { textAlign: 'center', alignSelf: 'stretch' },
  secondary: { color: lightColors.textSecondary },
  event: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  eventIcon: { padding: spacing.sm, borderRadius: radii.md },
  eventText: { flex: 1, minWidth: 0, gap: spacing.xs },
  action: {
    minHeight: 64, padding: spacing.md, gap: spacing.sm,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: radii.lg, borderWidth: 1, borderColor: lightColors.borderSubtle,
  },
});
