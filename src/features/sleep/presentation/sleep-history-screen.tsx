import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

import { sleepDurationMs, type SleepEvent } from '../domain/sleep';
import {
  formatSleepDateHeading,
  formatSleepDuration,
  formatSleepRange,
  groupSleepByLocalEndDate,
} from './sleep-format';
import { useSleep } from './use-sleep';

export function SleepHistoryScreen() {
  const { t } = useTranslation();
  const { state, controller } = useSleep();

  if (state.status === 'loading') return <Screen style={styles.centered}>
    <ActivityIndicator color={lightColors.actionPrimary} />
    <AppText>{t('sleep.history.loading')}</AppText>
  </Screen>;
  if (state.status === 'error') return <Screen style={styles.centered}><Card style={styles.card}>
    <AppText variant="headingMedium">{t('sleep.history.error.title')}</AppText>
    <AppText style={styles.secondary}>{t('sleep.history.error.description')}</AppText>
    <Button onPress={() => void controller.refresh()}>{t('bootstrap.retry')}</Button>
  </Card></Screen>;

  const groups = groupSleepByLocalEndDate(state.value.events);
  return <Screen style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.introduction}>
      <AppText variant="headingLarge">{t('sleep.history.title')}</AppText>
      <AppText style={styles.secondary}>{t('sleep.history.description')}</AppText>
    </View>
    {groups.length === 0 ? <Card style={styles.card}>
      <AppText>{t('sleep.history.empty')}</AppText>
    </Card> : groups.map((group) => <View key={group.key} style={styles.group}>
      <AppText variant="headingSmall">{formatSleepDateHeading(
        group.headingEpochMs,
        state.value.nowEpochMs,
        { today: t('sleep.history.today'), yesterday: t('sleep.history.yesterday') },
      )}</AppText>
      {group.events.map((event) => <SleepEventCard event={event} key={event.id} />)}
    </View>)}
  </ScrollView></Screen>;
}

function SleepEventCard({ event }: Readonly<{ event: SleepEvent }>) {
  return <Card style={styles.eventCard}>
    <AppText variant="label">{formatSleepRange(event)}</AppText>
    <AppText style={styles.secondary}>{formatSleepDuration(sleepDurationMs(event))}</AppText>
  </Card>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.xl },
  introduction: { gap: spacing.sm },
  card: { width: '100%', gap: spacing.lg },
  group: { gap: spacing.md },
  eventCard: { gap: spacing.xs },
  secondary: { color: lightColors.textSecondary },
});
