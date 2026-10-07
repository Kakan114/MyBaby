import { assertEpochRange, type EpochRange } from '../../../utils/epoch-range';
import { activeSleepElapsedMs, completedSleepUnionDurationMs, type ActiveSleepSession } from '../domain/sleep';
import type { SleepDayReader } from './sleep-day-reader';

export type SleepDaySummary = Readonly<{
  completedDurationMs: number;
  active: Readonly<{
    session: ActiveSleepSession;
    elapsedMs: number;
    clockMovedBackward: boolean;
  }> | null;
}>;

export async function getSleepDaySummary(
  reader: SleepDayReader, childId: string, day: EpochRange, nowEpochMs: number,
): Promise<SleepDaySummary> {
  assertEpochRange(day);
  const events = await reader.listCompletedOverlapping(childId, day);
  const session = await reader.getActiveByChildId(childId);
  if (events.some((event) => event.childId !== childId) ||
      (session !== null && session.childId !== childId)) {
    throw new Error('Sleep summary ownership mismatch.');
  }
  return {
    completedDurationMs: completedSleepUnionDurationMs(events, day),
    active: session === null ? null : {
      session, ...activeSleepElapsedMs(session, nowEpochMs),
    },
  };
}
