import { describe, expect, it, vi } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';

import {
  createAndroidMaterialPickerDateFromCalendarDate,
  createCalendarDateFromAndroidMaterialPickerDate,
  createCalendarDateFromLocalPickerDate,
} from './onboarding-date';

describe('createCalendarDateFromLocalPickerDate', () => {
  it('creates a canonical calendar date from local date parts', () => {
    const pickerDate = new Date(2025, 0, 10, 12, 0, 0);

    expect(createCalendarDateFromLocalPickerDate(pickerDate)).toBe('2025-01-10');
  });

  it('preserves a valid local leap day', () => {
    const pickerDate = new Date(2024, 1, 29, 12, 0, 0);

    expect(createCalendarDateFromLocalPickerDate(pickerDate)).toBe('2024-02-29');
  });

  it('uses local rather than UTC calendar parts', () => {
    const pickerDate = new Date(2025, 6, 14, 12, 0, 0);
    vi.spyOn(pickerDate, 'getFullYear').mockReturnValue(2025);
    vi.spyOn(pickerDate, 'getMonth').mockReturnValue(6);
    vi.spyOn(pickerDate, 'getDate').mockReturnValue(14);
    vi.spyOn(pickerDate, 'getUTCFullYear').mockReturnValue(2025);
    vi.spyOn(pickerDate, 'getUTCMonth').mockReturnValue(6);
    vi.spyOn(pickerDate, 'getUTCDate').mockReturnValue(13);

    expect(createCalendarDateFromLocalPickerDate(pickerDate)).toBe('2025-07-14');
  });
});

describe('createCalendarDateFromAndroidMaterialPickerDate', () => {
  it('preserves the UTC calendar day represented by Material DatePicker', () => {
    const pickerDate = new Date(Date.UTC(2025, 0, 10));
    vi.spyOn(pickerDate, 'getFullYear').mockReturnValue(2025);
    vi.spyOn(pickerDate, 'getMonth').mockReturnValue(0);
    vi.spyOn(pickerDate, 'getDate').mockReturnValue(9);

    expect(createCalendarDateFromAndroidMaterialPickerDate(pickerDate)).toBe(
      '2025-01-10'
    );
  });

  it('preserves a leap day represented by Material DatePicker', () => {
    const pickerDate = new Date(Date.UTC(2024, 1, 29));

    expect(createCalendarDateFromAndroidMaterialPickerDate(pickerDate)).toBe(
      '2024-02-29'
    );
  });
});

describe('createAndroidMaterialPickerDateFromCalendarDate', () => {
  it('represents the calendar day as UTC midnight for Material DatePicker', () => {
    const previousTimezone = process.env.TZ;

    try {
      process.env.TZ = 'America/Los_Angeles';

      const expectedUtcMidnight = Date.UTC(2026, 9, 4);
      const localMidnight = new Date(2026, 9, 4).getTime();
      const pickerDate = createAndroidMaterialPickerDateFromCalendarDate(
        createCalendarDate('2026-10-04')
      );

      expect(localMidnight).not.toBe(expectedUtcMidnight);
      expect(pickerDate.getTime()).toBe(expectedUtcMidnight);
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    }
  });
});
