import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { FeedingHistoryScreen } from '@/features/feeding/presentation/feeding-history-screen';

export default function FeedingHistoryRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          title: t('feeding.history.title'),
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <FeedingHistoryScreen />
    </>
  );
}
