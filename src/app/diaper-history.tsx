import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { DiaperScreen } from '@/features/diapers/presentation/diaper-screen';

export default function DiaperHistoryRoute() {
  const { t } = useTranslation();

  return <>
    <Stack.Screen options={{
      title: t('diapers.history.title'),
      headerBackButtonDisplayMode: 'minimal',
    }} />
    <DiaperScreen mode="history" />
  </>;
}
