import { describe, expect, it } from 'vitest';

import {
  CalendarDateValidationError,
  createCalendarDate,
  getCalendarDateParts,
} from './calendar-date';

describe('CalendarDate', () => {
  it('accepts and parses a valid leap day', () => {
    const date = createCalendarDate('2024-02-29');

    expect(date).toBe('2024-02-29');
    expect(getCalendarDateParts(date)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('rejects 29 February in a non-leap year', () => {
    const error = captureError(() => createCalendarDate('2025-02-29'));

    expect(error).toBeInstanceOf(CalendarDateValidationError);
    expect(error).toMatchObject({ code: 'invalid-calendar-date' });
  });

  it('rejects malformed input with a stable code', () => {
    const error = captureError(() => createCalendarDate('02/29/2024'));

    expect(error).toBeInstanceOf(CalendarDateValidationError);
    expect(error).toMatchObject({ code: 'invalid-calendar-date' });
  });
});

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error('Expected action to throw.');
}
