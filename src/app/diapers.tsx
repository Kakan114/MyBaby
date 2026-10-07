import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DiaperScreen } from '@/features/diapers/presentation/diaper-screen';

export default function DiapersRoute() {
  const { t } = useTranslation();
  return <>
    <Stack.Screen options={{ title: t('diapers.title'), headerBackButtonDisplayMode: 'minimal' }} />
    <DiaperScreen />
  </>;
}
