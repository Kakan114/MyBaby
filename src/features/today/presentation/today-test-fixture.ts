import { createCalendarDate } from '../../children/domain/calendar-date';
import { getChildAge } from '../../children/domain/age';
import type { TodaySummary } from '../application/today-summary';

export function todayFixture(childId = 'mio'): TodaySummary {
  const birthday = createCalendarDate('2024-03-07');
  const date = createCalendarDate('2026-10-07');
  return {
    child: { id: childId, displayName: childId === 'mio' ? 'Mio' : 'Kim', dateOfBirth: birthday },
    age: getChildAge(birthday, date),
    capturedAtEpochMs: Date.parse('2026-10-07T12:00:00Z'),
    day: {
      calendarDate: date, timeZone: 'Europe/Stockholm',
      startEpochMs: Date.parse('2026-10-06T22:00:00Z'),
      endEpochMs: Date.parse('2026-10-07T22:00:00Z'),
    },
    feeding: { dayCount: 3, latestCompletedAtEpochMs: Date.parse('2026-10-07T08:00:00Z') },
    diapers: { dayCount: 4, latestOccurredAtEpochMs: Date.parse('2026-10-06T08:00:00Z') },
    sleep: { completedDurationMs: 7_380_000, active: null },
  };
}
