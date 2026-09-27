const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

declare const calendarDateBrand: unique symbol;

export type CalendarDate = string & {
  readonly [calendarDateBrand]: true;
};

export type CalendarDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  const daysByMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return daysByMonth[month - 1] ?? 0;
}

export function getCalendarDateParts(value: CalendarDate | string): CalendarDateParts {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    throw new RangeError('Calendar date must use the YYYY-MM-DD format.');
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > getDaysInMonth(year, month)) {
    throw new RangeError(`Invalid calendar date: ${value}.`);
  }

  return { year, month, day };
}

export function createCalendarDate(value: string): CalendarDate {
  getCalendarDateParts(value);
  return value as CalendarDate;
}

export function createCalendarDateFromParts(parts: CalendarDateParts): CalendarDate {
  const value = [
    parts.year.toString().padStart(4, '0'),
    parts.month.toString().padStart(2, '0'),
    parts.day.toString().padStart(2, '0'),
  ].join('-');

  return createCalendarDate(value);
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return left.localeCompare(right);
}

export function calendarDateToEpochDay(value: CalendarDate): number {
  const { year, month, day } = getCalendarDateParts(value);
  const utcDate = new Date(0);

  utcDate.setUTCHours(0, 0, 0, 0);
  utcDate.setUTCFullYear(year, month - 1, day);

  return Math.floor(utcDate.getTime() / MILLISECONDS_PER_DAY);
}

export function getLastDayOfMonth(year: number, month: number): number {
  return getDaysInMonth(year, month);
}
