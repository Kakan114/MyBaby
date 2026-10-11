import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chooseLocalCivilInstant,
  civilDateFromAndroidDatePicker,
  createAndroidDatePickerValue,
  resolveLocalCivilDateTime,
} from './local-civil-date-time';

describe('shared local civil time', () => {
  const originalTimeZone = process.env.TZ;

  beforeEach(() => { process.env.TZ = 'Europe/Stockholm'; });
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('keeps Android calendar dates at UTC midnight', () => {
    const date = createAndroidDatePickerValue({ year: 2026, month: 10, day: 4 });
    expect(date.getTime()).toBe(Date.UTC(2026, 9, 4));
    expect(civilDateFromAndroidDatePicker(date)).toEqual({ year: 2026, month: 10, day: 4 });
  });
  it('detects Stockholm DST gaps and repeated times', () => {
    expect(resolveLocalCivilDateTime({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }))
      .toEqual({ status: 'nonexistent' });
    expect(resolveLocalCivilDateTime({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }))
      .toEqual({
        status: 'ambiguous',
        epochMs: [Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 9, 25, 1, 30)],
      });
  });

  it('resolves an ordinary local time and a leap day exactly', () => {
    expect(resolveLocalCivilDateTime({ year: 2028, month: 2, day: 29, hour: 12, minute: 15 }))
      .toEqual({ status: 'unique', epochMs: Date.UTC(2028, 1, 29, 11, 15) });
  });

  it('requires an explicit occurrence before choosing an ambiguous instant', () => {
    const civil = { year: 2026, month: 10, day: 25, hour: 2, minute: 30 };
    expect(chooseLocalCivilInstant(civil, null)).toEqual({ status: 'ambiguous' });
    expect(chooseLocalCivilInstant(civil, 0)).toEqual({
      status: 'valid', epochMs: Date.UTC(2026, 9, 25, 0, 30),
    });
    expect(chooseLocalCivilInstant(civil, 1)).toEqual({
      status: 'valid', epochMs: Date.UTC(2026, 9, 25, 1, 30),
    });
  });

  it('never silently normalizes invalid civil fields', () => {
    for (const civil of [
      { year: 2026, month: 2, day: 29, hour: 12, minute: 0 },
      { year: 2026, month: 13, day: 1, hour: 12, minute: 0 },
      { year: 2026, month: 1, day: 1, hour: 24, minute: 0 },
      { year: 2026, month: 1, day: 1, hour: 12, minute: 60 },
      { year: 2026, month: 1, day: 1, hour: 12.5, minute: 0 },
    ]) {
      expect(() => resolveLocalCivilDateTime(civil)).toThrow();
    }
  });

  it('uses the selected device timezone rather than parsing an unqualified string', () => {
    const civil = { year: 2026, month: 7, day: 10, hour: 12, minute: 0 };
    const stockholm = resolveLocalCivilDateTime(civil);
    process.env.TZ = 'America/Los_Angeles';
    const losAngeles = resolveLocalCivilDateTime(civil);
    expect(stockholm).toEqual({ status: 'unique', epochMs: Date.UTC(2026, 6, 10, 10, 0) });
    expect(losAngeles).toEqual({ status: 'unique', epochMs: Date.UTC(2026, 6, 10, 19, 0) });
  });
});
