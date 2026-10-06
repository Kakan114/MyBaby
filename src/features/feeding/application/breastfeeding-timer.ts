import type { FeedingIdGenerator } from './feeding-id-generator';
import type { EpochClock } from './epoch-clock';
import type { BreastfeedingTimerRepository } from './breastfeeding-timer-repository';
import {
  assertEpochMs,
  finishBreastfeedingTimer,
  pauseBreastfeedingTimer,
  resumeBreastfeedingTimer,
  startBreastfeedingTimer,
  switchBreastfeedingTimer,
  timerDurationSeconds,
  type BreastSide,
  type BreastfeedingTimerSession,
} from '../domain/breastfeeding-timer';
import {
  createFeedingEvent,
  type BreastFeedingEvent,
} from '../domain/feeding-event';

export type BreastfeedingTimerApplicationErrorCode =
  | 'active-child-mismatch'
  | 'timer-already-exists'
  | 'timer-not-found'
  | 'timer-not-finished'
  | 'timer-busy'
  | 'timer-transition-not-allowed';

export class BreastfeedingTimerApplicationError extends Error {
  constructor(readonly code: BreastfeedingTimerApplicationErrorCode) {
    super('The breastfeeding timer operation is not available.');
    this.name = 'BreastfeedingTimerApplicationError';
  }
}

export type BreastfeedingTimerOperationResult = Readonly<{
  session: BreastfeedingTimerSession;
  clockMovedBackward: boolean;
}>;

type TimerDependencies = Readonly<{
  clock: EpochClock;
  repository: BreastfeedingTimerRepository;
}>;

function now(clock: EpochClock): number {
  const value = clock.now();
  assertEpochMs(value);
  return value;
}

async function requireSession(
  repository: BreastfeedingTimerRepository,
): Promise<BreastfeedingTimerSession> {
  const session = await repository.get();
  if (session === null) {
    throw new BreastfeedingTimerApplicationError('timer-not-found');
  }
  return session;
}

function requireChild(session: BreastfeedingTimerSession, activeChildId: string) {
  if (session.childId !== activeChildId) {
    throw new BreastfeedingTimerApplicationError('active-child-mismatch');
  }
}

export async function startTimer(
  dependencies: TimerDependencies & Readonly<{ idGenerator: FeedingIdGenerator }>,
  childId: string,
  side: BreastSide,
): Promise<BreastfeedingTimerOperationResult> {
  if (await dependencies.repository.get() !== null) {
    throw new BreastfeedingTimerApplicationError('timer-already-exists');
  }
  const session = startBreastfeedingTimer(
    dependencies.idGenerator.generate(),
    childId,
    side,
    now(dependencies.clock),
  );
  await dependencies.repository.create(session);
  return { session, clockMovedBackward: false };
}

export async function pauseTimer(
  dependencies: TimerDependencies,
  activeChildId: string,
): Promise<BreastfeedingTimerOperationResult> {
  const session = await requireSession(dependencies.repository);
  requireChild(session, activeChildId);
  if (session.status !== 'running') {
    throw new BreastfeedingTimerApplicationError('timer-transition-not-allowed');
  }
  const result = pauseBreastfeedingTimer(session, now(dependencies.clock));
  await dependencies.repository.replace(result.session);
  return result;
}

export async function resumeTimer(
  dependencies: TimerDependencies,
  activeChildId: string,
): Promise<BreastfeedingTimerOperationResult> {
  const session = await requireSession(dependencies.repository);
  requireChild(session, activeChildId);
  if (session.status !== 'paused') {
    throw new BreastfeedingTimerApplicationError('timer-transition-not-allowed');
  }
  const next = resumeBreastfeedingTimer(session, now(dependencies.clock));
  await dependencies.repository.replace(next);
  return { session: next, clockMovedBackward: false };
}

export async function switchTimerSide(
  dependencies: TimerDependencies,
  activeChildId: string,
): Promise<BreastfeedingTimerOperationResult> {
  const session = await requireSession(dependencies.repository);
  requireChild(session, activeChildId);
  if (session.status === 'finished') {
    throw new BreastfeedingTimerApplicationError('timer-transition-not-allowed');
  }
  const result = switchBreastfeedingTimer(
    session,
    session.status === 'running' ? now(dependencies.clock) : undefined,
  );
  await dependencies.repository.replace(result.session);
  return result;
}

export async function finishTimer(
  dependencies: TimerDependencies,
  activeChildId: string,
): Promise<BreastfeedingTimerOperationResult> {
  const session = await requireSession(dependencies.repository);
  requireChild(session, activeChildId);
  if (session.status === 'finished') {
    throw new BreastfeedingTimerApplicationError('timer-transition-not-allowed');
  }
  const result = finishBreastfeedingTimer(session, now(dependencies.clock));
  // A sub-second session cannot become a permanently unsaveable finished row.
  // Leave the persisted running/paused state intact so the parent can continue it.
  if (result.session.status !== 'finished') {
    await dependencies.repository.replace(result.session);
    return result;
  }
  timerDurationSeconds(result.session);
  await dependencies.repository.replace(result.session);
  return result;
}

export async function recoverRunningTimerAfterClockRollback(
  dependencies: TimerDependencies,
  activeChildId: string,
  session: Extract<BreastfeedingTimerSession, { status: 'running' }>,
): Promise<BreastfeedingTimerOperationResult> {
  requireChild(session, activeChildId);
  const currentEpochMs = now(dependencies.clock);
  if (currentEpochMs >= session.segmentStartedAtEpochMs) {
    return { session, clockMovedBackward: false };
  }

  const result = pauseBreastfeedingTimer(session, currentEpochMs);
  await dependencies.repository.replace(result.session);
  return result;
}

export async function completeTimer(
  dependencies: Readonly<{
    repository: BreastfeedingTimerRepository;
    idGenerator: FeedingIdGenerator;
  }>,
  activeChildId: string,
): Promise<BreastFeedingEvent> {
  const session = await requireSession(dependencies.repository);
  requireChild(session, activeChildId);
  if (session.status !== 'finished') {
    throw new BreastfeedingTimerApplicationError('timer-not-finished');
  }
  const durations = timerDurationSeconds(session);
  const event = createFeedingEvent({
    id: dependencies.idGenerator.generate(),
    childId: session.childId,
    occurredAtEpochMs: session.finishedAtEpochMs,
    kind: 'breast',
    ...durations,
  });
  if (event.kind !== 'breast') {
    throw new BreastfeedingTimerApplicationError('timer-transition-not-allowed');
  }
  await dependencies.repository.complete(session.sessionId, event);
  return event;
}

export async function discardTimer(
  repository: BreastfeedingTimerRepository,
  activeChildId: string,
): Promise<void> {
  const session = await requireSession(repository);
  requireChild(session, activeChildId);
  await repository.discard(session.sessionId);
}
