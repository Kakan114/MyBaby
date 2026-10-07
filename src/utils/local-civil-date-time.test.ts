import { describe, expect, it } from 'vitest';
import {
  civilDateFromAndroidDatePicker,
  createAndroidDatePickerValue,
  resolveLocalCivilDateTime,
} from './local-civil-date-time';

describe('shared local civil time', () => {
  it('keeps Android calendar dates at UTC midnight', () => {
    const date = createAndroidDatePickerValue({ year: 2026, month: 10, day: 4 });
    expect(date.getTime()).toBe(Date.UTC(2026, 9, 4));
    expect(civilDateFromAndroidDatePicker(date)).toEqual({ year: 2026, month: 10, day: 4 });
  });
  it('detects Stockholm DST gaps and repeated times', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Europe/Stockholm';
    try {
      expect(resolveLocalCivilDateTime({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }))
        .toEqual({ status: 'nonexistent' });
      expect(resolveLocalCivilDateTime({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }))
        .toMatchObject({ status: 'ambiguous' });
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
});
