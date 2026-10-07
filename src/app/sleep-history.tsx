import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SleepHistoryScreen } from '@/features/sleep/presentation/sleep-history-screen';

export default function SleepHistoryRoute() {
  const { t } = useTranslation();

  return <>
    <Stack.Screen options={{
      title: t('sleep.history.title'),
      headerBackButtonDisplayMode: 'minimal',
    }} />
    <SleepHistoryScreen />
  </>;
}
