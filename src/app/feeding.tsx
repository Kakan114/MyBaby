import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { CompletedFeedingScreen } from '@/features/feeding/presentation/completed-feeding-screen';

export default function FeedingRoute() {
  const { t } = useTranslation();
  return <>
    <Stack.Screen options={{ title: t('feeding.title'), headerBackButtonDisplayMode: 'minimal' }} />
    <CompletedFeedingScreen />
  </>;
}
