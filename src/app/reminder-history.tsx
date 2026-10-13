import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ReminderScreen } from '@/features/reminders/presentation/reminder-screen';

export default function ReminderHistoryRoute() {
  const { t } = useTranslation();
  return <><Stack.Screen options={{ title: t('reminders.historyTitle'), headerBackButtonDisplayMode: 'minimal' }} />
    <ReminderScreen mode="past" /></>;
}
