import {
  calendarDateToEpochDay,
  compareCalendarDates,
  createCalendarDateFromParts,
  getCalendarDateParts,
  getLastDayOfMonth,
  type CalendarDate,
  type CalendarDateParts,
} from './calendar-date';

export type CalendarAge = Readonly<{
  years: number;
  months: number;
  days: number;
}>;

function assertReferenceDateIsValid(dateOfBirth: CalendarDate, asOf: CalendarDate): void {
  if (compareCalendarDates(dateOfBirth, asOf) > 0) {
    throw new RangeError('Reference date must not be before the date of birth.');
  }
}

function addYearsClamped(date: CalendarDate, years: number): CalendarDate {
  const parts = getCalendarDateParts(date);
  const targetYear = parts.year + years;

  return createCalendarDateFromParts({
    year: targetYear,
    month: parts.month,
    day: Math.min(parts.day, getLastDayOfMonth(targetYear, parts.month)),
  });
}

function addMonthsClamped(date: CalendarDate, months: number): CalendarDate {
  const parts = getCalendarDateParts(date);
  const totalMonths = parts.year * 12 + (parts.month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  return createCalendarDateFromParts({
    year: targetYear,
    month: targetMonth,
    day: Math.min(parts.day, getLastDayOfMonth(targetYear, targetMonth)),
  });
}

function differenceInDays(start: CalendarDate, end: CalendarDate): number {
  return calendarDateToEpochDay(end) - calendarDateToEpochDay(start);
}

export function getFullDaysSinceBirth(dateOfBirth: CalendarDate, asOf: CalendarDate): number {
  assertReferenceDateIsValid(dateOfBirth, asOf);
  return differenceInDays(dateOfBirth, asOf);
}

export function getFullWeeksSinceBirth(dateOfBirth: CalendarDate, asOf: CalendarDate): number {
  return Math.floor(getFullDaysSinceBirth(dateOfBirth, asOf) / 7);
}

export function getCalendarAge(dateOfBirth: CalendarDate, asOf: CalendarDate): CalendarAge {
  assertReferenceDateIsValid(dateOfBirth, asOf);

  const birthParts = getCalendarDateParts(dateOfBirth);
  const referenceParts = getCalendarDateParts(asOf);
  let years = referenceParts.year - birthParts.year;
  let yearAnchor = addYearsClamped(dateOfBirth, years);

  if (compareCalendarDates(yearAnchor, asOf) > 0) {
    years -= 1;
    yearAnchor = addYearsClamped(dateOfBirth, years);
  }

  const yearAnchorParts: CalendarDateParts = getCalendarDateParts(yearAnchor);
  let months =
    (referenceParts.year - yearAnchorParts.year) * 12 +
    (referenceParts.month - yearAnchorParts.month);
  let monthAnchor = addMonthsClamped(yearAnchor, months);

  if (compareCalendarDates(monthAnchor, asOf) > 0) {
    months -= 1;
    monthAnchor = addMonthsClamped(yearAnchor, months);
  }

  return {
    years,
    months,
    days: differenceInDays(monthAnchor, asOf),
  };
}

/** Calendar age plus whole calendar days/weeks since birth for infant precision. */
export type ChildAge = CalendarAge & Readonly<{
  fullDays: number;
  fullWeeks: number;
  remainingWeekDays: number;
}>;

export function getChildAge(dateOfBirth: CalendarDate, asOf: CalendarDate): ChildAge {
  const calendarAge = getCalendarAge(dateOfBirth, asOf);
  const fullDays = getFullDaysSinceBirth(dateOfBirth, asOf);
  const fullWeeks = getFullWeeksSinceBirth(dateOfBirth, asOf);

  return {
    ...calendarAge,
    fullDays,
    fullWeeks,
    remainingWeekDays: fullDays - fullWeeks * 7,
  };
}
