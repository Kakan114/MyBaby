import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { lightColors, spacing } from '@/theme/tokens';

export default function TodayScreen() {
  return (
    <Screen style={styles.screen}>
      <AppText variant="headingLarge">Idag</AppText>
      <AppText style={styles.description}>Din översikt kommer att visas här.</AppText>
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
