import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReminder } from '../domain/reminder';
import { emptyReminderDraft, parseReminderDraft, reminderDraftFromReminder } from './reminder-form';

describe('Reminder presentation civil-time form', () => {
  const originalTimeZone = process.env.TZ;
  beforeEach(() => { process.env.TZ = 'Europe/Stockholm'; });
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('requires explicit title, date and time and trims a valid title', () => {
    expect(parseReminderDraft(emptyReminderDraft, 0)).toEqual({
      values: null,
      errors: { title: 'required', date: 'required', time: 'required' },
    });
    expect(parseReminderDraft({
      title: '  BVC  ', date: { year: 2026, month: 10, day: 12 },
      time: { hour: 10, minute: 30 }, occurrence: null,
    }, Date.UTC(2026, 9, 10))).toMatchObject({ values: { title: 'BVC' }, errors: {} });
  });

  it('counts Unicode code points and rejects only titles beyond 100 characters', () => {
    const base = { date: { year: 2026, month: 10, day: 12 }, time: { hour: 10, minute: 30 }, occurrence: null } as const;
    expect(parseReminderDraft({ ...base, title: '👶'.repeat(100) }, 0).values?.title).toBe('👶'.repeat(100));
    expect(parseReminderDraft({ ...base, title: '👶'.repeat(101) }, 0).errors.title).toBe('tooLong');
  });

  it('rejects past and exact-now instants', () => {
    const draft = { title: 'BVC', date: { year: 2026, month: 10, day: 12 },
      time: { hour: 10, minute: 30 }, occurrence: null } as const;
    const instant = new Date(2026, 9, 12, 10, 30).getTime();
    expect(parseReminderDraft(draft, instant).errors.time).toBe('notFuture');
    expect(parseReminderDraft(draft, instant + 1).errors.time).toBe('notFuture');
  });

  it('rejects spring gaps and requires explicit autumn-overlap occurrence', () => {
    expect(parseReminderDraft({ title: 'Gap', date: { year: 2026, month: 3, day: 29 },
      time: { hour: 2, minute: 30 }, occurrence: null }, 0).errors.time).toBe('nonexistent');
    const overlap = { title: 'Overlap', date: { year: 2026, month: 10, day: 25 },
      time: { hour: 2, minute: 30 }, occurrence: null } as const;
    expect(parseReminderDraft(overlap, 0).errors.time).toBe('ambiguous');
    expect(parseReminderDraft({ ...overlap, occurrence: 0 }, 0).values?.scheduledAtEpochMs)
      .toBe(Date.UTC(2026, 9, 25, 0, 30));
    expect(parseReminderDraft({ ...overlap, occurrence: 1 }, 0).values?.scheduledAtEpochMs)
      .toBe(Date.UTC(2026, 9, 25, 1, 30));
  });

  it('rejects invalid civil dates and clock times without normalization', () => {
    expect(parseReminderDraft({ title: 'Datum', date: { year: 2026, month: 2, day: 30 },
      time: { hour: 10, minute: 30 }, occurrence: null }, 0).errors.date).toBe('invalid');
    expect(parseReminderDraft({ title: 'Tid', date: { year: 2026, month: 10, day: 12 },
      time: { hour: 24, minute: 0 }, occurrence: null }, 0).errors.time).toBe('invalid');
  });

  it('round-trips an edited ambiguous reminder without changing its chosen instant', () => {
    const reminder = createReminder({ id: 'id', childId: 'child', title: 'Tid',
      scheduledAtEpochMs: Date.UTC(2026, 9, 25, 1, 30), revision: 1 });
    const draft = reminderDraftFromReminder(reminder);
    expect(draft.occurrence).toBe(1);
    expect(parseReminderDraft(draft, 0).values?.scheduledAtEpochMs).toBe(reminder.scheduledAtEpochMs);
  });
});
