import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';
import { useChildBootstrap } from '../../children/presentation/child-bootstrap-gate';
import { TodayDashboard } from './today-dashboard';
import { useTodaySummary } from './use-today-summary';

export function TodayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { state, now, retry } = useTodaySummary();
  const { refreshBootstrap } = useChildBootstrap();
  useEffect(() => {
    if (state.status === 'missing') void refreshBootstrap();
  }, [state.status, refreshBootstrap]);
  return <Screen>
    <ScrollView contentContainerStyle={styles.content}>
      <AppText variant="headingSmall">{t('screens.today.title')}</AppText>
      {state.status === 'ready'
        ? <TodayDashboard summary={state.summary} now={now} t={t} navigate={route => router.push(route)} />
        : state.status === 'loading'
          ? <Card style={styles.card} accessibilityState={{ busy: true }}>
            <ActivityIndicator color={lightColors.actionPrimary} />
            <AppText>{t('screens.today.loading')}</AppText>
          </Card>
          : <Card style={styles.card}>
            <AppText variant="headingMedium">{t(`screens.today.${state.status === 'missing' ? 'missing' : 'error'}.title`)}</AppText>
            <AppText>{t(`screens.today.${state.status === 'missing' ? 'missing' : 'error'}.description`)}</AppText>
            <Button onPress={() => { void (state.status === 'missing' ? refreshBootstrap() : retry()); }}>
              {t('bootstrap.retry')}
            </Button>
          </Card>}
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({
  content: { paddingVertical: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  card: { gap: spacing.lg },
});
