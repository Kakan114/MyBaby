import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

export default function FamilyScreen() {
  const { t } = useTranslation();

  return (
    <Screen style={styles.screen}>
      <AppText variant="headingLarge">{t('screens.family.title')}</AppText>
      <AppText style={styles.description}>{t('screens.family.description')}</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
    gap: spacing.sm,
  },
  description: {
    color: lightColors.textSecondary,
  },
});
