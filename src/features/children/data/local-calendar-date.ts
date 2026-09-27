import {
  createCalendarDateFromParts,
  type CalendarDate,
} from '../domain/calendar-date';

export function toLocalCalendarDate(date: Date): CalendarDate {
  return createCalendarDateFromParts({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

export function getCurrentLocalCalendarDate(): CalendarDate {
  return toLocalCalendarDate(new Date());
}
