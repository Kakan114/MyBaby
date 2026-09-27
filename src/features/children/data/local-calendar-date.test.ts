import { describe, expect, it, vi } from 'vitest';

import { toLocalCalendarDate } from './local-calendar-date';

describe('toLocalCalendarDate', () => {
  it('uses the Date local calendar fields', () => {
    const date = new Date(2025, 0, 2, 0, 5);

    expect(toLocalCalendarDate(date)).toBe('2025-01-02');
  });

  it('does not convert through an ISO UTC date', () => {
    const date = new Date(2025, 0, 2, 23, 55);
    const toISOString = vi.spyOn(date, 'toISOString').mockImplementation(() => {
      throw new Error('UTC conversion must not be used.');
    });

    expect(toLocalCalendarDate(date)).toBe('2025-01-02');
    expect(toISOString).not.toHaveBeenCalled();
  });
});
