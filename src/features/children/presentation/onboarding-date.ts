import {
  createCalendarDateFromParts,
  getCalendarDateParts,
  type CalendarDate,
} from '../domain/calendar-date';

export function createAndroidMaterialPickerDateFromCalendarDate(
  value: CalendarDate
): Date {
  const { year, month, day } = getCalendarDateParts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function createCalendarDateFromLocalPickerDate(date: Date): CalendarDate {
  return createCalendarDateFromParts({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

export function createCalendarDateFromAndroidMaterialPickerDate(
  date: Date
): CalendarDate {
  return createCalendarDateFromParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}
