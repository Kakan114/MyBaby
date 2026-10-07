import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

import { activeSleepElapsedMs } from '../domain/sleep';
import {
  formatSleepClock,
  formatActiveSleepElapsed,
} from './sleep-format';
import { useSleep } from './use-sleep';
import { ManualSleepEntry } from './manual-sleep-entry';
import { openSleepHistory } from './sleep-history-navigation';

export function SleepScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, controller } = useSleep();

  if (state.status === 'loading') {
    return <Screen style={styles.centered}><ActivityIndicator color={lightColors.actionPrimary} />
      <AppText>{t('sleep.loading')}</AppText></Screen>;
  }
  if (state.status === 'error') {
    return <Screen style={styles.centered}><Card style={styles.card}>
      <AppText variant="headingMedium">{t('sleep.error.title')}</AppText>
      <AppText style={styles.secondary}>{t('sleep.error.description')}</AppText>
      <Button onPress={() => void controller.refresh()}>{t('bootstrap.retry')}</Button>
    </Card></Screen>;
  }

  const { value, busy, checkedAfterFailure } = state;
  const active = value.active;
  const elapsed = active === null ? null : activeSleepElapsedMs(active, value.nowEpochMs);

  const confirmDiscard = () => Alert.alert(
    t('sleep.discard.title'), t('sleep.discard.message'), [
      { text: t('sleep.discard.cancel'), style: 'cancel' },
      { text: t('sleep.discard.confirm'), style: 'destructive', onPress: () => void controller.discard() },
    ],
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introduction}>
          <AppText variant="headingLarge">{t('sleep.title')}</AppText>
          <AppText style={styles.secondary}>{t('sleep.description')}</AppText>
        </View>
        <Card style={styles.card}>
          {active === null ? (
            <>
              <AppText variant="headingMedium">{t('sleep.idle')}</AppText>
              <Button disabled={busy} onPress={() => void controller.start()}>
                {t('sleep.start')}
              </Button>
            </>
          ) : (
            <>
              <AppText variant="headingMedium">{t('sleep.active')}</AppText>
              <AppText>{t('sleep.startedAt', { time: formatSleepClock(active.startedAtEpochMs) })}</AppText>
              <AppText variant="display">
                {formatActiveSleepElapsed(elapsed?.elapsedMs ?? 0)}
              </AppText>
              {(value.clockMovedBackward || elapsed?.clockMovedBackward) && (
                <View style={styles.notice}>
                  <AppText variant="label">{t('sleep.clock.title')}</AppText>
                  <AppText style={styles.secondary}>{t('sleep.clock.description')}</AppText>
                </View>
              )}
              <Button
                disabled={busy || value.clockMovedBackward || elapsed?.clockMovedBackward}
                onPress={() => void controller.complete()}>
                {t('sleep.complete')}
              </Button>
              <Button disabled={busy} onPress={confirmDiscard} variant="secondary">
                {t('sleep.discard.action')}
              </Button>
            </>
          )}
          {checkedAfterFailure && (
            <View style={styles.notice}>
              <AppText variant="label">{t('sleep.uncertain.title')}</AppText>
              <AppText style={styles.secondary}>{t('sleep.uncertain.description')}</AppText>
            </View>
          )}
        </Card>

        <ManualSleepEntry childId={value.childId} controller={controller} />
        <Button onPress={() => openSleepHistory((route) => router.push(route))} variant="secondary">
          {t('sleep.history.open')}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.xl },
  introduction: { gap: spacing.sm },
  card: { width: '100%', gap: spacing.lg },
  secondary: { color: lightColors.textSecondary },
  notice: { backgroundColor: lightColors.surfaceMuted, padding: spacing.md, gap: spacing.xs },
});
