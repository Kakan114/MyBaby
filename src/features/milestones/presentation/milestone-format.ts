import { getCalendarDateParts, type CalendarDate } from '../../children/domain/calendar-date';

export function formatMilestoneDate(value: CalendarDate): string {
  const parts = getCalendarDateParts(value);
  return new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}
