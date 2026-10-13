import type { Reminder } from '../domain/reminder';

export function formatReminderDateTime(reminder: Pick<Reminder, 'scheduledAtEpochMs'>): string {
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(reminder.scheduledAtEpochMs));
}
