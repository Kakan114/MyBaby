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
