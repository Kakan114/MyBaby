import { describe, expect, it } from 'vitest';

import { getCalendarAge, getFullDaysSinceBirth, getFullWeeksSinceBirth } from './age';
import { createCalendarDate } from './calendar-date';

const date = createCalendarDate;

describe('child age calculations', () => {
  it('returns zero days and weeks on the date of birth', () => {
    const dateOfBirth = date('2025-06-15');

    expect(getFullDaysSinceBirth(dateOfBirth, dateOfBirth)).toBe(0);
    expect(getFullWeeksSinceBirth(dateOfBirth, dateOfBirth)).toBe(0);
    expect(getCalendarAge(dateOfBirth, dateOfBirth)).toEqual({ years: 0, months: 0, days: 0 });
  });

  it('returns seven days and one full week after exactly seven days', () => {
    const dateOfBirth = date('2025-06-15');
    const asOf = date('2025-06-22');

    expect(getFullDaysSinceBirth(dateOfBirth, asOf)).toBe(7);
    expect(getFullWeeksSinceBirth(dateOfBirth, asOf)).toBe(1);
  });

  it('handles a year boundary', () => {
    const dateOfBirth = date('2024-12-31');
    const asOf = date('2025-01-01');

    expect(getFullDaysSinceBirth(dateOfBirth, asOf)).toBe(1);
    expect(getCalendarAge(dateOfBirth, asOf)).toEqual({ years: 0, months: 0, days: 1 });
  });

  it('handles an ordinary month boundary', () => {
    const dateOfBirth = date('2025-04-15');
    const asOf = date('2025-05-15');

    expect(getFullDaysSinceBirth(dateOfBirth, asOf)).toBe(30);
    expect(getCalendarAge(dateOfBirth, asOf)).toEqual({ years: 0, months: 1, days: 0 });
  });

  it('clamps 31 January to 28 February', () => {
    expect(getCalendarAge(date('2025-01-31'), date('2025-02-28'))).toEqual({
      years: 0,
      months: 1,
      days: 0,
    });
  });

  it('measures from the clamped February anchor on 1 March', () => {
    expect(getCalendarAge(date('2025-01-31'), date('2025-03-01'))).toEqual({
      years: 0,
      months: 1,
      days: 1,
    });
  });

  it('clamps a leap-day birthday to 28 February in the following non-leap year', () => {
    expect(getCalendarAge(date('2024-02-29'), date('2025-02-28'))).toEqual({
      years: 1,
      months: 0,
      days: 0,
    });
  });

  it('measures one day after the clamped leap-day anniversary on 1 March', () => {
    expect(getCalendarAge(date('2024-02-29'), date('2025-03-01'))).toEqual({
      years: 1,
      months: 0,
      days: 1,
    });
  });

  it('rejects a reference date before the date of birth', () => {
    const dateOfBirth = date('2025-06-15');
    const asOf = date('2025-06-14');

    expect(() => getFullDaysSinceBirth(dateOfBirth, asOf)).toThrow(RangeError);
    expect(() => getFullWeeksSinceBirth(dateOfBirth, asOf)).toThrow(RangeError);
    expect(() => getCalendarAge(dateOfBirth, asOf)).toThrow(RangeError);
  });
});
