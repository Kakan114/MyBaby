import type { ActiveChildSummary } from '../../children/application/get-active-child-summary';
import type { CalendarDate } from '../../children/domain/calendar-date';
import type { FeedingSummary } from '../../feeding/application/feeding-summary-reader';
import type { DiaperSummary } from '../../diapers/application/diaper-summary-reader';
import type { SleepDaySummary } from '../../sleep/application/get-sleep-day-summary';
import type { EpochRange } from '../../../utils/epoch-range';

export type LocalDayContext = EpochRange & Readonly<{
  calendarDate: CalendarDate;
  timeZone: string;
}>;

export type TodaySummary = ActiveChildSummary & Readonly<{
  capturedAtEpochMs: number;
  day: LocalDayContext;
  feeding: FeedingSummary;
  diapers: DiaperSummary;
  sleep: SleepDaySummary;
}>;

export type TodaySummaryResult =
  | Readonly<{ status: 'ready'; summary: TodaySummary }>
  | Readonly<{ status: 'missing-active-child' }>;
