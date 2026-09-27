import { describe, expect, it } from 'vitest';

import { createCalendarDate, getCalendarDateParts } from './calendar-date';

describe('CalendarDate', () => {
  it('accepts and parses a valid leap day', () => {
    const date = createCalendarDate('2024-02-29');

    expect(date).toBe('2024-02-29');
    expect(getCalendarDateParts(date)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('rejects 29 February in a non-leap year', () => {
    expect(() => createCalendarDate('2025-02-29')).toThrow(RangeError);
  });
});
