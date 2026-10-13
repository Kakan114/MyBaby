import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ReminderScreen } from '@/features/reminders/presentation/reminder-screen';

export default function RemindersRoute() {
  const { t } = useTranslation();
  return <><Stack.Screen options={{ title: t('reminders.title'), headerBackButtonDisplayMode: 'minimal' }} />
    <ReminderScreen mode="upcoming" /></>;
}
