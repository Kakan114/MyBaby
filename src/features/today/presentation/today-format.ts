import type { TFunction } from 'i18next';
import { calendarDateToEpochDay, createCalendarDate } from '../../children/domain/calendar-date';
import type { LocalDayContext } from '../application/today-summary';

export function localContextKey(now: number): string {
  const date = new Date(now);
  return [date.getFullYear(), date.getMonth(), date.getDate(),
    Intl.DateTimeFormat().resolvedOptions().timeZone, date.getTimezoneOffset()].join('|');
}

export function formatTodayDate(day: LocalDayContext): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: day.timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(day.startEpochMs);
}

function calendarAt(epoch: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(epoch);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return createCalendarDate(`${part('year')}-${part('month')}-${part('day')}`);
}

export function formatLatest(epoch: number | null, day: LocalDayContext, t: TFunction): string {
  if (epoch === null) return t('todayDashboard.noEvents');
  const eventDate = calendarAt(epoch, day.timeZone);
  const difference = calendarDateToEpochDay(day.calendarDate) - calendarDateToEpochDay(eventDate);
  const context = difference === 0 ? t('todayDashboard.today')
    : difference === 1 ? t('todayDashboard.yesterday')
      : new Intl.DateTimeFormat('sv-SE', {
        timeZone: day.timeZone, day: 'numeric', month: 'short', year: 'numeric',
      }).format(epoch);
  const time = new Intl.DateTimeFormat('sv-SE', {
    timeZone: day.timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(epoch);
  return t('todayDashboard.latestTime', { dayLabel: context, time });
}

export function formatCompletedDuration(ms: number, t: TFunction): string {
  if (ms > 0 && ms < 60_000) return t('todayDashboard.lessThanMinute');
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? t('todayDashboard.hoursMinutes', { hours, minutes: minutes % 60 })
    : t('todayDashboard.minutes', { minutes });
}

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function millisecondsUntilLocalMidnight(now: number): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(1, nextDay.getTime() - now);
}
