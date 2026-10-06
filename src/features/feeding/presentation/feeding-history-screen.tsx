import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

import type { FeedingEvent } from '../domain/feeding-event';
import {
  formatFeedingHistoryValue,
  formatLocalClockTime,
  formatLocalDateHeading,
  groupFeedingsByLocalDate,
} from './feeding-history-format';
import { useFeedingHistory } from './use-feeding-history';

export function FeedingHistoryScreen() {
  const { t } = useTranslation();
  const { state, retry } = useFeedingHistory();

  if (state.status === 'loading') {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={lightColors.actionPrimary} />
        <AppText>{t('feeding.history.loading')}</AppText>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.messageCard}>
          <AppText variant="headingMedium">{t('feeding.history.error.title')}</AppText>
          <AppText style={styles.secondary}>{t('feeding.history.error.description')}</AppText>
          <Button onPress={() => void retry()}>{t('bootstrap.retry')}</Button>
        </Card>
      </Screen>
    );
  }

  if (state.status === 'empty') {
    return (
      <Screen style={styles.centered}>
        <Card style={styles.messageCard}>
          <AppText variant="headingMedium">{t('feeding.history.empty')}</AppText>
        </Card>
      </Screen>
    );
  }

  const nowEpochMs = Date.now();
  const groups = groupFeedingsByLocalDate(state.result.events);

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.introduction}>
          <AppText variant="headingLarge">{t('feeding.history.title')}</AppText>
          <AppText style={styles.secondary}>{t('feeding.history.description')}</AppText>
        </View>
        {groups.map((group) => (
          <View key={group.dateKey} style={styles.group}>
            <AppText variant="headingSmall">
              {formatLocalDateHeading(group.headingEpochMs, nowEpochMs, {
                today: t('feeding.history.date.today'),
                yesterday: t('feeding.history.date.yesterday'),
              })}
            </AppText>
            {group.events.map((event) => (
              <HistoryEventCard event={event} key={event.id} />
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function HistoryEventCard({ event }: Readonly<{ event: FeedingEvent }>) {
  const { t } = useTranslation();
  const value = formatFeedingHistoryValue(event, {
    left: t('feeding.timer.side.left'),
    right: t('feeding.timer.side.right'),
    minute: t('feeding.history.duration.minute'),
    second: t('feeding.history.duration.second'),
    bottleContents: {
      'expressed-breast-milk': t('feeding.bottle.contents.expressed-breast-milk'),
      formula: t('feeding.bottle.contents.formula'),
      mixed: t('feeding.bottle.contents.mixed'),
    },
  });

  return (
    <Card style={styles.eventCard}>
      <View style={styles.eventHeader}>
        <AppText variant="label">
          {t(event.kind === 'breast' ? 'feeding.kind.breast' : 'feeding.kind.bottle')}
        </AppText>
        <AppText style={styles.secondary} variant="bodySmall">
          {formatLocalClockTime(event.occurredAtEpochMs)}
        </AppText>
      </View>
      <AppText>{value}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.none },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.xl },
  introduction: { gap: spacing.sm },
  group: { gap: spacing.md },
  eventCard: { gap: spacing.sm },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  messageCard: { width: '100%', gap: spacing.lg },
  secondary: { color: lightColors.textSecondary },
});
