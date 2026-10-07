import {
  createActiveSleepSession,
  createSleepEvent,
  type ActiveSleepSession,
  type SleepEvent,
} from '../domain/sleep';
import type { SleepIdGenerator } from './sleep-id-generator';
import type { SleepRepository } from './sleep-repository';

export const RECENT_SLEEP_LIMIT = 20;

export type SleepApplicationErrorCode =
  | 'clock-moved-backward'
  | 'sleep-session-changed'
  | 'future-completed-sleep'
  | 'overlaps-active-sleep'
  | 'completed-sleep-not-saved'
  | 'completed-sleep-outcome-uncertain';

export class SleepApplicationError extends Error {
  constructor(readonly code: SleepApplicationErrorCode) {
    super('The sleep operation is not available.');
    this.name = 'SleepApplicationError';
  }
}

export async function startSleep(
  dependencies: Readonly<{
    repository: SleepRepository;
    idGenerator: SleepIdGenerator;
  }>,
  childId: string,
  startedAtEpochMs: number,
): Promise<ActiveSleepSession> {
  const existing = await dependencies.repository.getActiveByChildId(childId);
  if (existing !== null) return existing;

  const session = createActiveSleepSession({
    id: dependencies.idGenerator.generate(),
    childId,
    startedAtEpochMs,
  });
  try {
    await dependencies.repository.createActive(session);
    return session;
  } catch (error) {
    const canonical = await dependencies.repository.getActiveByChildId(childId);
    if (canonical !== null) return canonical;
    throw error;
  }
}

export async function completeSleep(
  repository: SleepRepository,
  session: ActiveSleepSession,
  endedAtEpochMs: number,
): Promise<SleepEvent> {
  if (endedAtEpochMs < session.startedAtEpochMs) {
    throw new SleepApplicationError('clock-moved-backward');
  }
  const event = createSleepEvent({ ...session, endedAtEpochMs });
  try {
    await repository.complete(session, event);
    return event;
  } catch (error) {
    const [active, completed] = await Promise.all([
      repository.getActiveByChildId(session.childId),
      repository.getEventById(session.childId, session.id),
    ]);
    if (active === null && completed !== null) return completed;
    throw error;
  }
}

export async function discardSleep(
  repository: SleepRepository,
  session: ActiveSleepSession,
): Promise<void> {
  try {
    await repository.discard(session.childId, session.id);
  } catch (error) {
    const active = await repository.getActiveByChildId(session.childId);
    if (active === null) return;
    throw error;
  }
}

function sameSleepEvent(left: SleepEvent, right: SleepEvent): boolean {
  return left.id === right.id &&
    left.childId === right.childId &&
    left.startedAtEpochMs === right.startedAtEpochMs &&
    left.endedAtEpochMs === right.endedAtEpochMs;
}

export async function recordCompletedSleep(
  dependencies: Readonly<{
    repository: SleepRepository;
    idGenerator: SleepIdGenerator;
  }>,
  childId: string,
  startedAtEpochMs: number,
  endedAtEpochMs: number,
  currentEpochMs: number,
): Promise<SleepEvent> {
  if (endedAtEpochMs > currentEpochMs) {
    throw new SleepApplicationError('future-completed-sleep');
  }

  const active = await dependencies.repository.getActiveByChildId(childId);
  if (active !== null && endedAtEpochMs > active.startedAtEpochMs) {
    throw new SleepApplicationError('overlaps-active-sleep');
  }

  const event = createSleepEvent({
    id: dependencies.idGenerator.generate(),
    childId,
    startedAtEpochMs,
    endedAtEpochMs,
  });

  try {
    await dependencies.repository.saveCompleted(event);
    return event;
  } catch {
    let canonical: SleepEvent | null;
    try {
      canonical = await dependencies.repository.getEventById(childId, event.id);
    } catch {
      throw new SleepApplicationError('completed-sleep-outcome-uncertain');
    }

    if (canonical === null) {
      throw new SleepApplicationError('completed-sleep-not-saved');
    }
    if (!sameSleepEvent(canonical, event)) {
      throw new SleepApplicationError('completed-sleep-outcome-uncertain');
    }
    return canonical;
  }
}

export function listRecentSleep(
  repository: SleepRepository,
  childId: string,
): Promise<readonly SleepEvent[]> {
  return repository.listRecentByChildId(childId, RECENT_SLEEP_LIMIT);
}
