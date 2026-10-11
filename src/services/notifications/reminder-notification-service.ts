export const REMINDER_NOTIFICATION_IDENTIFIER_PREFIX = 'mybaby.reminder.v1.';

export type ReminderNotificationPermissionStatus =
  | 'authorized'
  | 'provisional'
  | 'ephemeral'
  | 'denied'
  | 'undetermined';

export type ScheduledReminderNotification = Readonly<{
  identifier: string;
  reminderId: string;
  /** Null when the native API cannot expose the original absolute trigger instant. */
  scheduledAtEpochMs: number | null;
}>;

export interface ReminderNotificationService {
  configurePlatform(): Promise<void>;
  getPermissionStatus(): Promise<ReminderNotificationPermissionStatus>;
  requestPermission(): Promise<ReminderNotificationPermissionStatus>;
  listScheduled(): Promise<readonly ScheduledReminderNotification[]>;
  schedule(reminderId: string, scheduledAtEpochMs: number): Promise<void>;
  cancel(reminderId: string): Promise<void>;
}

export function reminderNotificationIdentifier(reminderId: string): string {
  if (typeof reminderId !== 'string' || reminderId.trim().length === 0) {
    throw new Error('A Reminder notification requires a non-empty Reminder ID.');
  }
  return `${REMINDER_NOTIFICATION_IDENTIFIER_PREFIX}${reminderId}`;
}

export function reminderIdFromNotificationIdentifier(identifier: string): string | null {
  if (!identifier.startsWith(REMINDER_NOTIFICATION_IDENTIFIER_PREFIX)) return null;
  const reminderId = identifier.slice(REMINDER_NOTIFICATION_IDENTIFIER_PREFIX.length);
  return reminderId.length === 0 ? null : reminderId;
}

export function canDeliverReminderNotifications(
  status: ReminderNotificationPermissionStatus,
): boolean {
  return status === 'authorized' || status === 'provisional' || status === 'ephemeral';
}
