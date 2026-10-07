import type { SleepEvent } from '../domain/sleep';

function localDateKey(epochMs: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function previousDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function formatSleepDuration(durationMs: number): string {
  const totalSeconds = durationMs > 0
    ? Math.max(1, Math.floor(durationMs / 1_000))
    : 0;
  if (totalSeconds < 60) return `${totalSeconds} sek`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} h ${minutes} min`;
  if (hours > 0) return `${hours} h`;
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} min ${seconds} sek` : `${minutes} min`;
}

export function formatActiveSleepElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  return hours === 0
    ? clock
    : `${String(hours).padStart(2, '0')}:${clock}`;
}

export function formatSleepClock(epochMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(epochMs));
}

export function formatSleepDateHeading(
  epochMs: number,
  nowEpochMs: number,
  labels: Readonly<{ today: string; yesterday: string }>,
  timeZone?: string,
): string {
  const eventKey = localDateKey(epochMs, timeZone);
  const todayKey = localDateKey(nowEpochMs, timeZone);
  if (eventKey === todayKey) return labels.today;
  if (eventKey === previousDateKey(todayKey)) return labels.yesterday;
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric', month: 'long',
    ...(eventKey.slice(0, 4) === todayKey.slice(0, 4) ? {} : { year: 'numeric' as const }),
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(epochMs));
}

export function formatSleepRange(event: SleepEvent, timeZone?: string): string {
  const start = formatSleepClock(event.startedAtEpochMs, timeZone);
  const end = formatSleepClock(event.endedAtEpochMs, timeZone);
  const offset = (epochMs: number) => new Intl.DateTimeFormat('sv-SE', {
    timeZoneName: 'shortOffset', ...(timeZone ? { timeZone } : {}),
  }).formatToParts(new Date(epochMs))
    .find((part) => part.type === 'timeZoneName')?.value;
  const crossesClockChange =
    offset(event.startedAtEpochMs) !== offset(event.endedAtEpochMs);
  if (localDateKey(event.startedAtEpochMs, timeZone) === localDateKey(event.endedAtEpochMs, timeZone)) {
    if (crossesClockChange) {
      return `${start} (före tidsomställningen) – ${end} (efter tidsomställningen)`;
    }
    return `${start} – ${end}`;
  }
  const date = (epochMs: number) => new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}),
  }).format(new Date(epochMs));
  if (crossesClockChange) {
    return `${date(event.startedAtEpochMs)} ${start} (före tidsomställningen) – ${date(event.endedAtEpochMs)} ${end} (efter tidsomställningen)`;
  }
  return `${date(event.startedAtEpochMs)} ${start} – ${date(event.endedAtEpochMs)} ${end}`;
}

export function groupSleepByLocalEndDate(
  events: readonly SleepEvent[],
  timeZone?: string,
): readonly Readonly<{ key: string; headingEpochMs: number; events: readonly SleepEvent[] }>[] {
  const groups: Array<{ key: string; headingEpochMs: number; events: SleepEvent[] }> = [];
  for (const event of events) {
    const key = localDateKey(event.endedAtEpochMs, timeZone);
    const group = groups.at(-1);
    if (group?.key === key) group.events.push(event);
    else groups.push({ key, headingEpochMs: event.endedAtEpochMs, events: [event] });
  }
  return groups;
}
