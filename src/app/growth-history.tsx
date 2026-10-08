import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GrowthScreen } from '@/features/growth/presentation/growth-screen';

export default function GrowthRoute() {
  const { t } = useTranslation();
  return <><Stack.Screen options={{ title: t('growth.historyTitle'), headerBackButtonDisplayMode: 'minimal' }} />
    <GrowthScreen mode="history" /></>;
}
