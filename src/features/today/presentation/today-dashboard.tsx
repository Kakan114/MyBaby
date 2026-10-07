import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TFunction } from 'i18next';
import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { lightColors, spacing } from '@/theme/tokens';
import { formatChildAge } from '../../children/presentation/format-child-age';
import { activeSleepElapsedMs } from '../../sleep/domain/sleep';
import type { TodaySummary } from '../application/today-summary';
import { formatCompletedDuration, formatElapsed, formatLatest, formatTodayDate } from './today-format';
import { DashboardIcon, dashboardFitsRow, LatestEventRow, QuickLogAction, StatisticCard } from './today-dashboard-items';

export const quickRoutes = [
  { key: 'feeding', route: '/feeding' },
  { key: 'sleep', route: '/sleep' },
  { key: 'diapers', route: '/diapers' },
] as const;

export function TodayDashboard({ summary, now, t, navigate }: Readonly<{
  summary: TodaySummary; now: number; t: TFunction;
  navigate: (route: typeof quickRoutes[number]['route']) => void;
}>) {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const row = dashboardFitsRow(width - spacing.lg * 2 - insets.left - insets.right, fontScale,
    Math.max(summary.feeding.dayCount, summary.diapers.dayCount));
  const active = summary.sleep.active;
  const elapsed = active ? activeSleepElapsedMs(active.session, now) : null;
  return <View style={styles.sections}>
    <View style={styles.header}>
      <AppText variant="bodySmall" style={styles.secondary}>{formatTodayDate(summary.day)}</AppText>
      <AppText accessibilityRole="header" variant="headingLarge">{summary.child.displayName}</AppText>
      <AppText variant="bodyLarge" style={styles.secondary}>{formatChildAge(summary.age, t)}</AppText>
    </View>
    {elapsed && <Card style={[styles.section, styles.active]}>
      <View style={styles.activeHeading}>
        <DashboardIcon kind="sleep" />
        <AppText variant="headingSmall" style={styles.flexText}>{t('todayDashboard.activeSleep')}</AppText>
      </View>
      <AppText variant="headingLarge" accessibilityLabel={t('todayDashboard.elapsed', {
        time: formatElapsed(elapsed.elapsedMs),
      })}>{formatElapsed(elapsed.elapsedMs)}</AppText>
      <AppText variant="bodySmall">{t('todayDashboard.activeSeparate')}</AppText>
      {elapsed.clockMovedBackward && <AppText>{t('todayDashboard.clockChanged')}</AppText>}
    </Card>}
    <View style={styles.section}>
      <AppText accessibilityRole="header" variant="headingSmall">{t('todayDashboard.overview')}</AppText>
      <View testID="today-statistics" style={[styles.group, row && styles.row]}>
        <StatisticCard kind="feeding" value={String(summary.feeding.dayCount)}
          label={t('todayDashboard.stats.feeding', { count: summary.feeding.dayCount })} row={row} />
        <StatisticCard kind="sleep" value={formatCompletedDuration(summary.sleep.completedDurationMs, t)}
          label={t('todayDashboard.stats.sleep')} row={row} />
        <StatisticCard kind="diapers" value={String(summary.diapers.dayCount)}
          label={t('todayDashboard.stats.diapers')} row={row} />
      </View>
      <AppText variant="bodySmall" style={styles.secondary}>{t('todayDashboard.sleepNote')}</AppText>
    </View>
    <Card style={[styles.section, styles.latest]}>
      <AppText accessibilityRole="header" variant="headingSmall">{t('todayDashboard.latest')}</AppText>
      <LatestEventRow kind="feeding" label={t('todayDashboard.latestFeeding')}
        value={formatLatest(summary.feeding.latestCompletedAtEpochMs, summary.day, t)} />
      <View style={styles.divider} />
      <LatestEventRow kind="diapers" label={t('todayDashboard.latestDiaper')}
        value={formatLatest(summary.diapers.latestOccurredAtEpochMs, summary.day, t)} />
    </Card>
    <View style={styles.section}>
      <AppText accessibilityRole="header" variant="headingSmall">{t('todayDashboard.quickLog')}</AppText>
      <View testID="today-quick-actions" style={[styles.group, row && styles.row]}>
        {quickRoutes.map(({ key, route }) => <QuickLogAction key={key} kind={key}
          label={t(`todayDashboard.quick.${key}`)} row={row} onPress={() => navigate(route)} />)}
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  sections: { gap: spacing.xl },
  section: { gap: spacing.md },
  header: { gap: spacing.xs, paddingBottom: spacing.sm },
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  secondary: { color: lightColors.textSecondary },
  active: { backgroundColor: lightColors.surfaceMuted, shadowOpacity: 0, elevation: 0 },
  activeHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexText: { flex: 1, minWidth: 0 },
  latest: { shadowOpacity: 0, elevation: 0 },
  divider: { height: 1, backgroundColor: lightColors.borderSubtle },
});
