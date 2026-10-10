import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MilestoneScreen } from '@/features/milestones/presentation/milestone-screen';

export default function MilestoneHistoryRoute() {
  const { t } = useTranslation();
  return <><Stack.Screen options={{ title: t('milestones.historyTitle'), headerBackButtonDisplayMode: 'minimal' }} />
    <MilestoneScreen mode="history" /></>;
}
