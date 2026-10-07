import { StyleSheet, View } from 'react-native';
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
import { openFeedingLog, openSleepLog } from './log-hub-navigation';

export function LogHubScreen() {
  const { t } = useTranslation();
  const sleepState = useSleepHubStatus();
  const activeSleep = sleepState.status === 'ready' ? sleepState.value.active : null;
  const elapsed = activeSleep === null || sleepState.status !== 'ready'
    ? null
    : activeSleepElapsedMs(activeSleep, sleepState.value.nowEpochMs);
  return (
    <Screen style={styles.screen}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.lg },
  introduction: { gap: spacing.sm },
  card: { gap: spacing.md },
  sleepStatus: { gap: spacing.xs },
  secondary: { color: lightColors.textSecondary },
});
