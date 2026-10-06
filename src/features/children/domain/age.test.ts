import { describe, expect, it } from 'vitest';

import { getCalendarAge, getChildAge, getFullDaysSinceBirth, getFullWeeksSinceBirth } from './age';
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

describe('structured infant age', () => {
  it.each([
    ['2025-01-01', '2025-01-01', 0, 0, 0, 0, 0, 0],
    ['2025-01-01', '2025-01-02', 0, 0, 1, 1, 0, 1],
    ['2025-01-01', '2025-01-07', 0, 0, 6, 6, 0, 6],
    ['2025-01-01', '2025-01-14', 0, 0, 13, 13, 1, 6],
    ['2025-01-01', '2025-01-15', 0, 0, 14, 14, 2, 0],
    ['2025-01-01', '2025-01-26', 0, 0, 25, 25, 3, 4],
    ['2025-01-01', '2025-02-19', 0, 1, 18, 49, 7, 0],
    ['2025-01-01', '2025-02-25', 0, 1, 24, 55, 7, 6],
    ['2025-01-01', '2025-02-26', 0, 1, 25, 56, 8, 0],
    ['2025-01-01', '2025-03-01', 0, 2, 0, 59, 8, 3],
    ['2025-01-01', '2025-03-04', 0, 2, 3, 62, 8, 6],
    ['2025-01-31', '2025-02-28', 0, 1, 0, 28, 4, 0],
    ['2024-01-31', '2024-02-29', 0, 1, 0, 29, 4, 1],
    ['2025-01-31', '2025-03-31', 0, 2, 0, 59, 8, 3],
    ['2025-01-31', '2025-04-30', 0, 3, 0, 89, 12, 5],
    ['2024-02-29', '2024-04-29', 0, 2, 0, 60, 8, 4],
    ['2024-02-29', '2025-02-28', 1, 0, 0, 365, 52, 1],
    ['2024-02-29', '2025-04-28', 1, 2, 0, 424, 60, 4],
    ['2023-01-01', '2025-08-01', 2, 7, 0, 943, 134, 5],
  ])('%s through %s', (birth, asOf, years, months, days, fullDays, fullWeeks, remainingWeekDays) => {
    expect(getChildAge(date(birth), date(asOf))).toEqual({
      years, months, days, fullDays, fullWeeks, remainingWeekDays,
    });
  });

  it('rejects a future birth date', () => {
    expect(() => getChildAge(date('2025-01-02'), date('2025-01-01')))
      .toThrow(RangeError);
  });
});
