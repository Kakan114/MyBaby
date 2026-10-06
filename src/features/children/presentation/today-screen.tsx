import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

import { useChildBootstrap } from './child-bootstrap-gate';
import { formatChildAge } from './format-child-age';
import { useActiveChild } from './use-active-child';

export function TodayScreen() {
  const { t } = useTranslation();
  const { state, retry } = useActiveChild();
  const { refreshBootstrap } = useChildBootstrap();

  return (
    <Screen style={styles.screen}>
      <AppText variant="headingLarge">{t('screens.today.title')}</AppText>
      {state.status === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={lightColors.actionPrimary} />
          <AppText>{t('screens.today.loading')}</AppText>
        </View>
      ) : state.status === 'ready' ? (
        <Card style={styles.card}>
          <AppText variant="headingMedium">{state.summary.child.displayName}</AppText>
          <AppText style={styles.description}>
            {formatChildAge(state.summary.age, t)}
          </AppText>
        </Card>
      ) : (
        <Card style={styles.card}>
          <AppText variant="headingMedium">
            {t(state.status === 'missing'
              ? 'screens.today.missing.title'
              : 'screens.today.error.title')}
          </AppText>
          <AppText style={styles.description}>
            {t(state.status === 'missing'
              ? 'screens.today.missing.description'
              : 'screens.today.error.description')}
          </AppText>
          <Button onPress={() => {
            // Only bootstrap determines whether onboarding or tabs are available.
            void (state.status === 'missing' ? refreshBootstrap() : retry());
          }}>
            {t('bootstrap.retry')}
          </Button>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
    gap: spacing.lg,
  },
  card: {
    gap: spacing.md,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.md,
  },
  description: {
    color: lightColors.textSecondary,
  },
});
