import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MilestoneScreen } from '@/features/milestones/presentation/milestone-screen';

export default function MilestonesRoute() {
  const { t } = useTranslation();
  return <><Stack.Screen options={{ title: t('milestones.title'), headerBackButtonDisplayMode: 'minimal' }} />
    <MilestoneScreen mode="recording" /></>;
}
