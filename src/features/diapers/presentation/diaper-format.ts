import type { DiaperEvent } from '../domain/diaper-event';

export type DiaperHistoryGroup = Readonly<{
  key: string;
  headingEpochMs: number;
  events: readonly DiaperEvent[];
}>;

function localDateKey(epochMs: number): string {
  const date = new Date(epochMs);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

export function groupDiapersByLocalDate(events: readonly DiaperEvent[]): readonly DiaperHistoryGroup[] {
  const groups: Array<{ key: string; headingEpochMs: number; events: DiaperEvent[] }> = [];
  for (const event of events) {
    const key = localDateKey(event.occurredAtEpochMs);
    const current = groups.at(-1);
    if (current?.key === key) current.events.push(event);
    else groups.push({ key, headingEpochMs: event.occurredAtEpochMs, events: [event] });
  }
  return groups;
}

export function formatDiaperClock(epochMs: number): string {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(epochMs));
}

export function formatDiaperDateHeading(epochMs: number, nowEpochMs: number, labels: {
  today: string; yesterday: string;
}): string {
  const key = localDateKey(epochMs);
  const today = localDateKey(nowEpochMs);
  const current = new Date(nowEpochMs);
  const yesterdayDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  if (key === today) return labels.today;
  if (key === localDateKey(yesterdayDate.getTime())) return labels.yesterday;
  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric', month: 'long',
    ...(new Date(epochMs).getFullYear() === current.getFullYear() ? {} : { year: 'numeric' as const }),
  }).format(new Date(epochMs));
}
