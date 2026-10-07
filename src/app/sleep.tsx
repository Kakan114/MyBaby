import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SleepScreen } from '@/features/sleep/presentation/sleep-screen';

export default function SleepRoute() {
  const { t } = useTranslation();
  return <>
    <Stack.Screen options={{ title: t('sleep.title'), headerBackButtonDisplayMode: 'minimal' }} />
    <SleepScreen />
  </>;
}
