import { describe, expect, it } from 'vitest';

import {
  createReminder,
  MAX_REMINDER_EPOCH_MS,
  REMINDER_TITLE_MAX_LENGTH,
  ReminderValidationError,
  type Reminder,
} from './reminder';

const valid: Reminder = {
  id: 'reminder-id',
  childId: 'child-id',
  title: 'BVC-besök',
  scheduledAtEpochMs: Date.UTC(2026, 9, 10, 12, 30),
  revision: 1,
};

function expectInvalid(patch: Partial<Reminder>, code: string): void {
  expect(() => createReminder({ ...valid, ...patch })).toThrowError(ReminderValidationError);
  try {
    createReminder({ ...valid, ...patch });
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('Reminder', () => {
  it('creates an immutable detached reminder and trims its title', () => {
    const input = { ...valid, title: '  BVC-besök  ' };
    const reminder = createReminder(input);
    expect(reminder).toEqual(valid);
    expect(reminder).not.toBe(input);
    expect(Object.isFrozen(reminder)).toBe(true);
    input.title = 'Changed';
    expect(reminder.title).toBe('BVC-besök');
    expect(Reflect.set(reminder, 'title', 'Changed')).toBe(false);
  });

  it('accepts the 100-character title boundary without truncation', () => {
    const title = '👶'.repeat(REMINDER_TITLE_MAX_LENGTH);
    expect(createReminder({ ...valid, title: ` ${title} ` }).title).toBe(title);
  });

  it.each(['', ' \n\t ', 'a'.repeat(REMINDER_TITLE_MAX_LENGTH + 1)])(
    'rejects invalid title %#',
    (title) => expectInvalid({ title }, 'invalid-title'),
  );

  it('rejects a non-string title', () => {
    expectInvalid({ title: 123 as never }, 'invalid-title');
  });

  it.each([
    { id: '' },
    { id: '   ' },
    { childId: '' },
    { childId: '\n ' },
    { id: 123 as never },
    { childId: null as never },
  ])('rejects invalid identity %#', (patch) => {
    expectInvalid(patch, 'invalid-identity');
  });

  it.each([
    -MAX_REMINDER_EPOCH_MS,
    0,
    MAX_REMINDER_EPOCH_MS,
  ])('accepts exact valid Date-range epoch %s', (scheduledAtEpochMs) => {
    expect(createReminder({ ...valid, scheduledAtEpochMs }).scheduledAtEpochMs)
      .toBe(scheduledAtEpochMs);
  });

  it.each([
    1.5,
    NaN,
    Infinity,
    -Infinity,
    MAX_REMINDER_EPOCH_MS + 1,
    -MAX_REMINDER_EPOCH_MS - 1,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid scheduled epoch %s without rounding', (scheduledAtEpochMs) => {
    expectInvalid({ scheduledAtEpochMs }, 'invalid-scheduled-instant');
  });

  it.each([1, 2, Number.MAX_SAFE_INTEGER])('accepts revision %s', (revision) => {
    expect(createReminder({ ...valid, revision }).revision).toBe(revision);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid revision %s',
    (revision) => expectInvalid({ revision }, 'invalid-revision'),
  );

  it('does not read the clock or enforce future-time policy', () => {
    expect(createReminder({ ...valid, scheduledAtEpochMs: 0 }).scheduledAtEpochMs).toBe(0);
  });
});
