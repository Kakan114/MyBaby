import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

export default function FamilyScreen() {
  return (
    <Screen style={styles.screen}>
      <AppText variant="headingLarge">Familj</AppText>
      <AppText style={styles.description}>Familj och inställningar kommer att finnas här.</AppText>
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
