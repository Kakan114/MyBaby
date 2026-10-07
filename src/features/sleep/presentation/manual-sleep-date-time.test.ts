import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  civilDateFromAndroidDatePicker,
  civilDateFromLocalPicker,
  civilTimeFromLocalPicker,
  createAndroidDatePickerValue,
  resolveLocalCivilDateTime,
  resolveManualSleepInterval,
} from './manual-sleep-date-time';

describe('manual sleep civil date/time', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => { process.env.TZ = 'Europe/Stockholm'; });
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('resolves a normal local wall-clock time to its one exact instant', () => {
    expect(resolveLocalCivilDateTime({
      year: 2026, month: 1, day: 10, hour: 12, minute: 30,
    })).toEqual({ status: 'unique', epochMs: Date.UTC(2026, 0, 10, 11, 30) });
  });

  it('rejects the normalized spring-forward gap instead of changing the wall time', () => {
    expect(resolveLocalCivilDateTime({
      year: 2026, month: 3, day: 29, hour: 2, minute: 30,
    })).toEqual({ status: 'nonexistent' });
  });

  it('requires and exposes both fall-back occurrences in chronological order', () => {
    expect(resolveLocalCivilDateTime({
      year: 2026, month: 10, day: 25, hour: 2, minute: 30,
    })).toEqual({
      status: 'ambiguous',
      epochMs: [Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30)],
    });
  });

  it('keeps Android Material dates as UTC days and time picker values as local time', () => {
    process.env.TZ = 'America/Los_Angeles';
    const value = createAndroidDatePickerValue({ year: 2026, month: 10, day: 4 });
    expect(value.getTime()).toBe(Date.UTC(2026, 9, 4));
    expect(civilDateFromAndroidDatePicker(value)).toEqual({
      year: 2026, month: 10, day: 4,
    });
    const localTime = new Date(2026, 9, 4, 21, 45);
    expect(civilTimeFromLocalPicker(localTime)).toEqual({ hour: 21, minute: 45 });
  });

  it('uses local calendar components for iOS picker values', () => {
    const value = new Date(2026, 11, 31, 23, 55);
    expect(civilDateFromLocalPicker(value)).toEqual({
      year: 2026, month: 12, day: 31,
    });
    expect(civilTimeFromLocalPicker(value)).toEqual({ hour: 23, minute: 55 });
  });

  it.each([
    [
      { year: 2026, month: 1, day: 10, hour: 12, minute: 0 },
      { year: 2026, month: 1, day: 10, hour: 13, minute: 0 },
    ],
    [
      { year: 2026, month: 1, day: 31, hour: 23, minute: 30 },
      { year: 2026, month: 2, day: 1, hour: 1, minute: 0 },
    ],
    [
      { year: 2026, month: 12, day: 31, hour: 23, minute: 30 },
      { year: 2027, month: 1, day: 1, hour: 1, minute: 0 },
    ],
  ])('accepts normal, cross-month, and cross-year intervals', (start, end) => {
    expect(resolveManualSleepInterval(start, end).status).toBe('valid');
  });

  it('rejects equal and backward intervals', () => {
    const later = { year: 2026, month: 1, day: 10, hour: 13, minute: 0 };
    const earlier = { year: 2026, month: 1, day: 10, hour: 12, minute: 0 };
    expect(resolveManualSleepInterval(later, later)).toEqual({ status: 'invalid-range' });
    expect(resolveManualSleepInterval(later, earlier)).toEqual({ status: 'invalid-range' });
  });

  it('requires an explicit occurrence and maps both repeated-hour choices exactly', () => {
    const repeated = { year: 2026, month: 10, day: 25, hour: 2, minute: 30 };
    const end = { year: 2026, month: 10, day: 25, hour: 3, minute: 30 };
    expect(resolveManualSleepInterval(repeated, end)).toEqual({ status: 'ambiguous' });
    expect(resolveManualSleepInterval(repeated, end, 0)).toMatchObject({
      status: 'valid', startedAtEpochMs: Date.UTC(2026, 9, 25, 0, 30),
    });
    expect(resolveManualSleepInterval(repeated, end, 1)).toMatchObject({
      status: 'valid', startedAtEpochMs: Date.UTC(2026, 9, 25, 1, 30),
    });
  });
});
