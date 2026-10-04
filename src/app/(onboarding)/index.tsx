import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

export default function OnboardingPlaceholderScreen() {
  const { t } = useTranslation();

  return (
    <Screen style={styles.screen}>
      <Card style={styles.card}>
        <AppText variant="headingLarge">
          {t('onboarding.placeholder.title')}
        </AppText>
        <AppText style={styles.description}>
          {t('onboarding.placeholder.description')}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  card: {
    gap: spacing.md,
  },
  description: {
    color: lightColors.textSecondary,
  },
});
