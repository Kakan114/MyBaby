import { assertEpochRange, type EpochRange } from '../../../utils/epoch-range';

export type ActiveSleepSession = Readonly<{
  id: string;
  childId: string;
  startedAtEpochMs: number;
}>;

export type SleepEvent = ActiveSleepSession & Readonly<{
  endedAtEpochMs: number;
}>;

export type SleepValidationErrorCode =
  | 'invalid-identity'
  | 'invalid-timestamp'
  | 'invalid-range';

export class SleepValidationError extends Error {
  constructor(readonly code: SleepValidationErrorCode) {
    super('The sleep value is invalid.');
    this.name = 'SleepValidationError';
  }
}

function assertIdentity(value: string): void {
  if (value.trim().length === 0) {
    throw new SleepValidationError('invalid-identity');
  }
}

export function assertSleepEpochMs(value: number): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isFinite(new Date(value).getTime())
  ) {
    throw new SleepValidationError('invalid-timestamp');
  }
}

export function createActiveSleepSession(
  input: ActiveSleepSession,
): ActiveSleepSession {
  assertIdentity(input.id);
  assertIdentity(input.childId);
  assertSleepEpochMs(input.startedAtEpochMs);
  return { ...input };
}

export function createSleepEvent(input: SleepEvent): SleepEvent {
  const session = createActiveSleepSession(input);
  assertSleepEpochMs(input.endedAtEpochMs);
  if (input.endedAtEpochMs <= session.startedAtEpochMs) {
    throw new SleepValidationError('invalid-range');
  }
  return { ...session, endedAtEpochMs: input.endedAtEpochMs };
}

export function sleepDurationMs(event: SleepEvent): number {
  return event.endedAtEpochMs - event.startedAtEpochMs;
}

export function activeSleepElapsedMs(
  session: ActiveSleepSession,
  nowEpochMs: number,
): Readonly<{ elapsedMs: number; clockMovedBackward: boolean }> {
  assertSleepEpochMs(nowEpochMs);
  if (nowEpochMs < session.startedAtEpochMs) {
    return { elapsedMs: 0, clockMovedBackward: true };
  }
  return {
    elapsedMs: nowEpochMs - session.startedAtEpochMs,
    clockMovedBackward: false,
  };
}

/** Measure the union of completed intervals clipped to a half-open calendar-day range. */
export function completedSleepUnionDurationMs(events: readonly SleepEvent[], range: EpochRange): number {
  assertEpochRange(range);
  const intervals = events.map((event) => {
    const value = createSleepEvent(event);
    return {
      start: Math.max(value.startedAtEpochMs, range.startEpochMs),
      end: Math.min(value.endedAtEpochMs, range.endEpochMs),
    };
  }).filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  let total = 0;
  let start = 0;
  let end = 0;
  for (const interval of intervals) {
    if (interval.start > end) {
      total += end - start;
      start = interval.start;
      end = interval.end;
    } else {
      end = Math.max(end, interval.end);
    }
  }
  return total + end - start;
}
