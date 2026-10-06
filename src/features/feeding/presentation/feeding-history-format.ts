import type { BottleContents, FeedingEvent } from '../domain/feeding-event';

type DateLabels = Readonly<{ today: string; yesterday: string }>;
type DurationLabels = Readonly<{ minute: string; second: string }>;
type FeedingValueLabels = DurationLabels & Readonly<{
  left: string;
  right: string;
  bottleContents: Readonly<Record<BottleContents, string>>;
}>;

export type FeedingHistoryGroup = Readonly<{
  dateKey: string;
  headingEpochMs: number;
  events: readonly FeedingEvent[];
}>;

function dateParts(epochMs: number, timeZone?: string) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Unable to format local calendar date.');
  }
  return { year, month, day, key: `${year}-${month}-${day}` };
}

function previousCalendarDateKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return [
    previous.getUTCFullYear(),
    String(previous.getUTCMonth() + 1).padStart(2, '0'),
    String(previous.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function groupFeedingsByLocalDate(
  events: readonly FeedingEvent[],
  timeZone?: string,
): readonly FeedingHistoryGroup[] {
  const groups: Array<{
    dateKey: string;
    headingEpochMs: number;
    events: FeedingEvent[];
  }> = [];

  for (const event of events) {
    const dateKey = dateParts(event.occurredAtEpochMs, timeZone).key;
    const current = groups.at(-1);
    if (current?.dateKey === dateKey) {
      current.events.push(event);
    } else {
      groups.push({
        dateKey,
        headingEpochMs: event.occurredAtEpochMs,
        events: [event],
      });
    }
  }

  return groups;
}

export function formatLocalDateHeading(
  epochMs: number,
  nowEpochMs: number,
  labels: DateLabels,
  timeZone?: string,
): string {
  const eventDate = dateParts(epochMs, timeZone);
  const today = dateParts(nowEpochMs, timeZone);
  if (eventDate.key === today.key) return labels.today;
  if (eventDate.key === previousCalendarDateKey(today.key)) return labels.yesterday;

  return new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric',
    month: 'long',
    ...(eventDate.year === today.year ? {} : { year: 'numeric' as const }),
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(epochMs));
}

export function formatLocalClockTime(epochMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(new Date(epochMs));
}

export function formatFeedingDuration(
  durationSeconds: number,
  labels: DurationLabels,
): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return [
    minutes > 0 ? `${minutes} ${labels.minute}` : null,
    seconds > 0 ? `${seconds} ${labels.second}` : null,
  ].filter((part): part is string => part !== null).join(' ');
}

export function formatAmountMl(amountMl: number): string {
  return `${new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(amountMl)} ml`;
}

export function formatFeedingHistoryValue(
  event: FeedingEvent,
  labels: FeedingValueLabels,
): string {
  if (event.kind === 'bottle') {
    return `${formatAmountMl(event.amountMl)} · ${labels.bottleContents[event.contents]}`;
  }

  const left = event.leftDurationSeconds > 0
    ? `${labels.left}${event.rightDurationSeconds > 0 ? ' ' : ' · '}${
      formatFeedingDuration(event.leftDurationSeconds, labels)
    }`
    : null;
  const right = event.rightDurationSeconds > 0
    ? `${labels.right}${event.leftDurationSeconds > 0 ? ' ' : ' · '}${
      formatFeedingDuration(event.rightDurationSeconds, labels)
    }`
    : null;
  return [left, right].filter((part): part is string => part !== null).join(' · ');
}
