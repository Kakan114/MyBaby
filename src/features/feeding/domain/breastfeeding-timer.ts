export type BreastSide = 'left' | 'right';

type TimerSessionCommon = Readonly<{
  sessionId: string;
  childId: string;
  accumulatedLeftMs: number;
  accumulatedRightMs: number;
}>;

export type RunningBreastfeedingTimer = TimerSessionCommon & Readonly<{
  status: 'running';
  activeSide: BreastSide;
  segmentStartedAtEpochMs: number;
}>;

export type PausedBreastfeedingTimer = TimerSessionCommon & Readonly<{
  status: 'paused';
  resumeSide: BreastSide;
}>;

export type FinishedBreastfeedingTimer = TimerSessionCommon & Readonly<{
  status: 'finished';
  finishedAtEpochMs: number;
}>;

export type BreastfeedingTimerSession =
  | RunningBreastfeedingTimer
  | PausedBreastfeedingTimer
  | FinishedBreastfeedingTimer;

export type BreastfeedingTimerErrorCode =
  | 'clock-moved-backward'
  | 'duration-too-short'
  | 'invalid-timer-state';

export class BreastfeedingTimerError extends Error {
  constructor(readonly code: BreastfeedingTimerErrorCode) {
    super('The breastfeeding timer state is invalid.');
    this.name = 'BreastfeedingTimerError';
  }
}

export type TimerTransitionResult = Readonly<{
  session: BreastfeedingTimerSession;
  clockMovedBackward: boolean;
}>;

export type ProjectedBreastfeedingDuration = Readonly<{
  leftMs: number;
  rightMs: number;
  clockMovedBackward: boolean;
}>;

const MAX_SAFE_EPOCH_MS = Number.MAX_SAFE_INTEGER;

export function assertEpochMs(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_EPOCH_MS) {
    throw new BreastfeedingTimerError('invalid-timer-state');
  }
}

function assertDurationMs(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BreastfeedingTimerError('invalid-timer-state');
  }
}

function assertIdentity(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BreastfeedingTimerError('invalid-timer-state');
  }
}

function assertBreastSide(value: unknown): asserts value is BreastSide {
  if (value !== 'left' && value !== 'right') {
    throw new BreastfeedingTimerError('invalid-timer-state');
  }
}

export function validateBreastfeedingTimerSession(
  session: BreastfeedingTimerSession,
): BreastfeedingTimerSession {
  assertIdentity(session.sessionId);
  assertIdentity(session.childId);
  assertDurationMs(session.accumulatedLeftMs);
  assertDurationMs(session.accumulatedRightMs);

  if (session.status === 'running') {
    assertBreastSide(session.activeSide);
    assertEpochMs(session.segmentStartedAtEpochMs);
  } else if (session.status === 'paused') {
    assertBreastSide(session.resumeSide);
  } else if (session.status === 'finished') {
    assertEpochMs(session.finishedAtEpochMs);
  } else {
    throw new BreastfeedingTimerError('invalid-timer-state');
  }

  return session;
}

export function startBreastfeedingTimer(
  sessionId: string,
  childId: string,
  side: BreastSide,
  nowEpochMs: number,
): RunningBreastfeedingTimer {
  return validateBreastfeedingTimerSession({
    sessionId,
    childId,
    status: 'running',
    activeSide: side,
    accumulatedLeftMs: 0,
    accumulatedRightMs: 0,
    segmentStartedAtEpochMs: nowEpochMs,
  }) as RunningBreastfeedingTimer;
}

function foldRunningSegment(
  session: RunningBreastfeedingTimer,
  nowEpochMs: number,
): Readonly<{
  accumulatedLeftMs: number;
  accumulatedRightMs: number;
  clockMovedBackward: boolean;
}> {
  assertEpochMs(nowEpochMs);
  if (nowEpochMs < session.segmentStartedAtEpochMs) {
    return {
      accumulatedLeftMs: session.accumulatedLeftMs,
      accumulatedRightMs: session.accumulatedRightMs,
      clockMovedBackward: true,
    };
  }

  const elapsed = nowEpochMs - session.segmentStartedAtEpochMs;
  const accumulatedLeftMs = session.accumulatedLeftMs +
    (session.activeSide === 'left' ? elapsed : 0);
  const accumulatedRightMs = session.accumulatedRightMs +
    (session.activeSide === 'right' ? elapsed : 0);
  assertDurationMs(accumulatedLeftMs);
  assertDurationMs(accumulatedRightMs);

  return { accumulatedLeftMs, accumulatedRightMs, clockMovedBackward: false };
}

export function projectBreastfeedingDuration(
  session: BreastfeedingTimerSession,
  nowEpochMs: number,
): ProjectedBreastfeedingDuration {
  validateBreastfeedingTimerSession(session);
  assertEpochMs(nowEpochMs);
  if (session.status !== 'running') {
    return {
      leftMs: session.accumulatedLeftMs,
      rightMs: session.accumulatedRightMs,
      clockMovedBackward: false,
    };
  }

  const folded = foldRunningSegment(session, nowEpochMs);
  return {
    leftMs: folded.accumulatedLeftMs,
    rightMs: folded.accumulatedRightMs,
    clockMovedBackward: folded.clockMovedBackward,
  };
}

export function pauseBreastfeedingTimer(
  session: RunningBreastfeedingTimer,
  nowEpochMs: number,
): TimerTransitionResult {
  const folded = foldRunningSegment(session, nowEpochMs);
  return {
    session: validateBreastfeedingTimerSession({
      sessionId: session.sessionId,
      childId: session.childId,
      status: 'paused',
      resumeSide: session.activeSide,
      accumulatedLeftMs: folded.accumulatedLeftMs,
      accumulatedRightMs: folded.accumulatedRightMs,
    }),
    clockMovedBackward: folded.clockMovedBackward,
  };
}

export function resumeBreastfeedingTimer(
  session: PausedBreastfeedingTimer,
  nowEpochMs: number,
): RunningBreastfeedingTimer {
  assertEpochMs(nowEpochMs);
  return validateBreastfeedingTimerSession({
    sessionId: session.sessionId,
    childId: session.childId,
    status: 'running',
    activeSide: session.resumeSide,
    accumulatedLeftMs: session.accumulatedLeftMs,
    accumulatedRightMs: session.accumulatedRightMs,
    segmentStartedAtEpochMs: nowEpochMs,
  }) as RunningBreastfeedingTimer;
}

export function switchBreastfeedingTimer(
  session: RunningBreastfeedingTimer | PausedBreastfeedingTimer,
  nowEpochMs?: number,
): TimerTransitionResult {
  if (session.status === 'paused') {
    return {
      session: validateBreastfeedingTimerSession({
        ...session,
        resumeSide: session.resumeSide === 'left' ? 'right' : 'left',
      }),
      clockMovedBackward: false,
    };
  }

  if (nowEpochMs === undefined) {
    throw new BreastfeedingTimerError('invalid-timer-state');
  }
  assertEpochMs(nowEpochMs);
  const folded = foldRunningSegment(session, nowEpochMs);
  if (folded.clockMovedBackward) {
    return pauseBreastfeedingTimer(session, nowEpochMs);
  }

  return {
    session: validateBreastfeedingTimerSession({
      sessionId: session.sessionId,
      childId: session.childId,
      status: 'running',
      activeSide: session.activeSide === 'left' ? 'right' : 'left',
      accumulatedLeftMs: folded.accumulatedLeftMs,
      accumulatedRightMs: folded.accumulatedRightMs,
      segmentStartedAtEpochMs: nowEpochMs,
    }),
    clockMovedBackward: false,
  };
}

export function finishBreastfeedingTimer(
  session: RunningBreastfeedingTimer | PausedBreastfeedingTimer,
  nowEpochMs: number,
): TimerTransitionResult {
  assertEpochMs(nowEpochMs);
  if (session.status === 'running') {
    const folded = foldRunningSegment(session, nowEpochMs);
    if (folded.clockMovedBackward) {
      return pauseBreastfeedingTimer(session, nowEpochMs);
    }
    return {
      session: validateBreastfeedingTimerSession({
        sessionId: session.sessionId,
        childId: session.childId,
        status: 'finished',
        accumulatedLeftMs: folded.accumulatedLeftMs,
        accumulatedRightMs: folded.accumulatedRightMs,
        finishedAtEpochMs: nowEpochMs,
      }),
      clockMovedBackward: false,
    };
  }

  return {
    session: validateBreastfeedingTimerSession({
      sessionId: session.sessionId,
      childId: session.childId,
      status: 'finished',
      accumulatedLeftMs: session.accumulatedLeftMs,
      accumulatedRightMs: session.accumulatedRightMs,
      finishedAtEpochMs: nowEpochMs,
    }),
    clockMovedBackward: false,
  };
}

export function timerDurationSeconds(session: FinishedBreastfeedingTimer) {
  const leftDurationSeconds = Math.floor(session.accumulatedLeftMs / 1_000);
  const rightDurationSeconds = Math.floor(session.accumulatedRightMs / 1_000);
  if (leftDurationSeconds + rightDurationSeconds === 0) {
    throw new BreastfeedingTimerError('duration-too-short');
  }
  return { leftDurationSeconds, rightDurationSeconds } as const;
}
