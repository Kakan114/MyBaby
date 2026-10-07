import { toLocalCalendarDate } from '../../children/data/local-calendar-date';
import { assertEpochRange } from '../../../utils/epoch-range';
import type { LocalDayContext } from '../application/today-summary';

/** Uses the device's current timezone; calendar advancement preserves DST day length. */
export function getLocalDayContext(nowEpochMs: number): LocalDayContext {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) {
    throw new RangeError('Invalid clock.');
  }
  const now = new Date(nowEpochMs);
  const start = new Date(nowEpochMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(nowEpochMs);
  // Advance from noon so a skipped/repeated current clock hour cannot change the target date.
  end.setHours(12, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  const day: LocalDayContext = {
    startEpochMs: start.getTime(),
    endEpochMs: end.getTime(),
    calendarDate: toLocalCalendarDate(now),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  assertEpochRange(day);
  return day;
}
