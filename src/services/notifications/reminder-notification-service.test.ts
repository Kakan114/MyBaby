import { describe, expect, it } from 'vitest';

import {
  canDeliverReminderNotifications,
  reminderIdFromNotificationIdentifier,
  reminderNotificationIdentifier,
} from './reminder-notification-service';

describe('Reminder notification service contracts', () => {
  it('creates and parses stable namespaced identifiers', () => {
    expect(reminderNotificationIdentifier('reminder-123'))
      .toBe('mybaby.reminder.v1.reminder-123');
    expect(reminderIdFromNotificationIdentifier('mybaby.reminder.v1.reminder-123'))
      .toBe('reminder-123');
    expect(reminderIdFromNotificationIdentifier('other.notification'))
      .toBeNull();
    expect(reminderIdFromNotificationIdentifier('mybaby.reminder.v1.'))
      .toBeNull();
    expect(() => reminderNotificationIdentifier(' ')).toThrow();
  });

  it('treats all iOS deliverable permission variants as deliverable', () => {
    expect(canDeliverReminderNotifications('authorized')).toBe(true);
    expect(canDeliverReminderNotifications('provisional')).toBe(true);
    expect(canDeliverReminderNotifications('ephemeral')).toBe(true);
    expect(canDeliverReminderNotifications('denied')).toBe(false);
    expect(canDeliverReminderNotifications('undetermined')).toBe(false);
  });
});
