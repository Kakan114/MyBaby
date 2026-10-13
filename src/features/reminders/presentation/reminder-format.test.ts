import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReminder } from '../domain/reminder';
import { reminderDraftFromReminder } from './reminder-form';

describe('Reminder date and time formatting', () => {
  const originalTimeZone = process.env.TZ;

  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
    vi.resetModules();
  });

  it('uses the current device timezone after it changes while the process remains alive', async () => {
    process.env.TZ = 'Europe/Stockholm';
    vi.resetModules();
    const { formatReminderDateTime } = await import('./reminder-format');
    const reminder = createReminder({
      id: 'reminder-id',
      childId: 'child-id',
      title: 'Påminnelse',
      scheduledAtEpochMs: Date.UTC(2026, 0, 1, 0, 30),
      revision: 1,
    });

    expect(formatReminderDateTime(reminder)).toMatch(/1 januari 2026.*01:30/);
    expect(reminderDraftFromReminder(reminder)).toMatchObject({
      date: { year: 2026, month: 1, day: 1 },
      time: { hour: 1, minute: 30 },
    });

    process.env.TZ = 'America/Los_Angeles';

    expect(formatReminderDateTime(reminder)).toMatch(/31 december 2025.*16:30/);
    expect(reminderDraftFromReminder(reminder)).toMatchObject({
      date: { year: 2025, month: 12, day: 31 },
      time: { hour: 16, minute: 30 },
    });
  });
});
