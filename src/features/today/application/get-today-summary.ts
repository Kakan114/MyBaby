import { getActiveChildSummary, type ActiveChildSummary } from '../../children/application/get-active-child-summary';
import type { ActiveChildDependencies } from '../../children/application/active-child';
import type { FeedingSummaryReader } from '../../feeding/application/feeding-summary-reader';
import type { DiaperSummaryReader } from '../../diapers/application/diaper-summary-reader';
import type { SleepDayReader } from '../../sleep/application/sleep-day-reader';
import { getSleepDaySummary } from '../../sleep/application/get-sleep-day-summary';
import { assertEpochRange } from '../../../utils/epoch-range';
import type { LocalDayContext, TodaySummaryResult } from './today-summary';

export type TodayReadRepositories = Readonly<{
  feeding: FeedingSummaryReader;
  diapers: DiaperSummaryReader;
  sleep: SleepDayReader;
}>;

export async function getTodaySummary(
  repositories: ActiveChildDependencies & TodayReadRepositories,
  nowEpochMs: number,
  day: LocalDayContext,
): Promise<TodaySummaryResult> {
  assertEpochRange(day);
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < day.startEpochMs ||
      nowEpochMs >= day.endEpochMs || day.timeZone.trim().length === 0) {
    throw new RangeError('Invalid Today time context.');
  }
  const childSummary: ActiveChildSummary | null =
    await getActiveChildSummary(repositories, day.calendarDate);
  if (childSummary === null) return { status: 'missing-active-child' };

  // Sequential reads keep all database work settled before releasing the queue.
  const feeding = await repositories.feeding.getCompletedSummary(childSummary.child.id, day);
  const diapers = await repositories.diapers.getEventSummary(childSummary.child.id, day);
  const sleep = await getSleepDaySummary(repositories.sleep, childSummary.child.id, day, nowEpochMs);
  return {
    status: 'ready',
    summary: { ...childSummary, capturedAtEpochMs: nowEpochMs, day, feeding, diapers, sleep },
  };
}
