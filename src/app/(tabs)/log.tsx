import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

export default function LogScreen() {
  return (
    <Screen style={styles.screen}>
      <AppText variant="headingLarge">Logga</AppText>
      <AppText style={styles.description}>Här kommer du att kunna registrera barnets vardag.</AppText>
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
