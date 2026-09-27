import { StyleSheet } from 'react-native';
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';

import { lightColors, spacing } from '@/theme/tokens';

export type ScreenProps = SafeAreaViewProps;

export function Screen({ style, ...props }: ScreenProps) {
  return <SafeAreaView style={[styles.screen, style]} {...props} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: lightColors.background,
    paddingHorizontal: spacing.lg,
  },
});
