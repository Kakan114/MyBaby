import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';
import { activeSleepElapsedMs } from '@/features/sleep/domain/sleep';
import {
  formatActiveSleepElapsed,
  formatSleepClock,
} from '@/features/sleep/presentation/sleep-format';

import { useSleepHubStatus } from './use-sleep-hub-status';
import { openDiaperLog, openFeedingLog, openSleepLog, openGrowthLog, openMilestones } from './log-hub-navigation';

const milestoneSymbol = { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' } as const satisfies
  ComponentProps<typeof SymbolView>['name'];

export function LogHubScreen() {
  const { t } = useTranslation();
  const sleepState = useSleepHubStatus();
  const activeSleep = sleepState.status === 'ready' ? sleepState.value.active : null;
  const elapsed = activeSleep === null || sleepState.status !== 'ready'
    ? null
    : activeSleepElapsedMs(activeSleep, sleepState.value.nowEpochMs);
  return (
    <Screen><ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.introduction}>
        <AppText variant="headingLarge">{t('logging.title')}</AppText>
        <AppText style={styles.secondary}>{t('logging.description')}</AppText>
      </View>
      <Card style={styles.card}>
        <AppText variant="headingMedium">{t('logging.feeding.title')}</AppText>
        <AppText style={styles.secondary}>{t('logging.feeding.description')}</AppText>
        <Button onPress={openFeedingLog}>{t('logging.feeding.open')}</Button>
      </Card>
      <Card style={styles.card}>
        <AppText variant="headingMedium">{t('logging.sleep.title')}</AppText>
        {sleepState.status === 'loading' ? (
          <AppText style={styles.secondary}>{t('logging.sleep.loading')}</AppText>
        ) : sleepState.status === 'unavailable' ? (
          <AppText style={styles.secondary}>{t('logging.sleep.unavailable')}</AppText>
        ) : activeSleep === null ? (
          <AppText style={styles.secondary}>{t('logging.sleep.description')}</AppText>
        ) : (
          <View style={styles.sleepStatus}>
            <AppText variant="label">
              {t('logging.sleep.ongoing', {
                elapsed: formatActiveSleepElapsed(elapsed?.elapsedMs ?? 0),
              })}
            </AppText>
            <AppText style={styles.secondary}>
              {t('logging.sleep.startedAt', {
                time: formatSleepClock(activeSleep.startedAtEpochMs),
              })}
            </AppText>
          </View>
        )}
        <Button onPress={openSleepLog}>
          {t(activeSleep === null ? 'logging.sleep.open' : 'logging.sleep.openOngoing')}
        </Button>
      </Card>
      <Card style={styles.card}>
        <AppText variant="headingMedium">{t('logging.diapers.title')}</AppText>
        <AppText style={styles.secondary}>{t('logging.diapers.description')}</AppText>
        <Button onPress={openDiaperLog}>{t('logging.diapers.open')}</Button>
      </Card>
      <Card style={styles.card}><AppText variant="headingMedium">{t('growth.title')}</AppText>
        <AppText style={styles.secondary}>{t('growth.description')}</AppText>
        <Button onPress={openGrowthLog}>{t('growth.open')}</Button></Card>
      <Card style={styles.card}>
        <View style={styles.milestoneHeading}><View accessible={false} accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants" style={styles.milestoneIcon}>
          <SymbolView name={milestoneSymbol} size={24} tintColor={lightColors.actionPrimary} />
        </View>
          <AppText variant="headingMedium">{t('logging.milestones.title')}</AppText></View>
        <AppText style={styles.secondary}>{t('logging.milestones.description')}</AppText>
        <Button onPress={openMilestones}>{t('logging.milestones.open')}</Button>
      </Card>
    </ScrollView></Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  introduction: { gap: spacing.sm },
  card: { gap: spacing.md },
  sleepStatus: { gap: spacing.xs },
  secondary: { color: lightColors.textSecondary },
  milestoneHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  milestoneIcon: { padding: spacing.sm, borderRadius: 9999, backgroundColor: lightColors.accentPeach },
});
