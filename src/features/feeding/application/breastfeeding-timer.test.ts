import { describe, expect, it, vi } from 'vitest';

import type { BreastfeedingTimerSession } from '../domain/breastfeeding-timer';
import type { FeedingEvent } from '../domain/feeding-event';
import {
  completeTimer,
  discardTimer,
  finishTimer,
  pauseTimer,
  recoverRunningTimerAfterClockRollback,
  resumeTimer,
  startTimer,
  switchTimerSide,
} from './breastfeeding-timer';
import type { BreastfeedingTimerRepository } from './breastfeeding-timer-repository';

class FakeRepository implements BreastfeedingTimerRepository {
  session: BreastfeedingTimerSession | null = null;
  events: FeedingEvent[] = [];
  failCompletion = false;

  async get() { return this.session; }
  async create(session: BreastfeedingTimerSession) {
    if (this.session !== null) throw new Error('singleton');
    this.session = session;
  }
  async replace(session: BreastfeedingTimerSession) { this.session = session; }
  async discard(sessionId: string) {
    if (this.session?.sessionId !== sessionId) throw new Error('missing');
    this.session = null;
  }
  async complete(sessionId: string, event: FeedingEvent) {
    if (this.failCompletion) throw new Error('transaction failed');
    if (this.session?.sessionId !== sessionId) throw new Error('missing');
    this.events.push(event);
    this.session = null;
  }
}

function fixture() {
  const repository = new FakeRepository();
  let epoch = 1_000_000;
  let id = 0;
  return {
    repository,
    clock: { now: () => epoch },
    idGenerator: { generate: () => `id-${++id}` },
    setTime(value: number) { epoch = value; },
  };
}

describe('breastfeeding timer application behavior', () => {
  it('persists start, pause, resume, switch and finish transitions', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'left');
    test.setTime(1_010_000);
    await pauseTimer(test, 'child-1');
    test.setTime(1_100_000);
    await resumeTimer(test, 'child-1');
    test.setTime(1_105_000);
    await switchTimerSide(test, 'child-1');
    test.setTime(1_120_000);
    await finishTimer(test, 'child-1');
    expect(test.repository.session).toMatchObject({
      status: 'finished', childId: 'child-1',
      accumulatedLeftMs: 15_000, accumulatedRightMs: 15_000,
      finishedAtEpochMs: 1_120_000,
    });
  });

  it('refuses a second app-wide session and child ownership mismatch', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'right');
    await expect(startTimer(test, 'child-2', 'left')).rejects.toMatchObject({
      code: 'timer-already-exists',
    });
    await expect(pauseTimer(test, 'child-2')).rejects.toMatchObject({
      code: 'active-child-mismatch',
    });
    expect(test.repository.session?.childId).toBe('child-1');
  });

  it.each(['running', 'paused', 'finished'] as const)(
    'restores the canonical %s session through a new consumer',
    async (target) => {
      const test = fixture();
      await startTimer(test, 'child-1', 'left');
      if (target !== 'running') {
        test.setTime(1_010_000);
        await pauseTimer(test, 'child-1');
      }
      if (target === 'finished') {
        test.setTime(1_020_000);
        await finishTimer(test, 'child-1');
      }
      const restoredByNewRuntime = await test.repository.get();
      expect(restoredByNewRuntime?.status).toBe(target);
    },
  );

  it('uses the frozen finish epoch and timer child for atomic completion', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'left');
    test.setTime(1_062_500);
    await finishTimer(test, 'child-1');
    test.setTime(9_999_999);

    const event = await completeTimer(test, 'child-1');

    expect(event).toMatchObject({
      id: 'id-2', childId: 'child-1', occurredAtEpochMs: 1_062_500,
      kind: 'breast', leftDurationSeconds: 62, rightDurationSeconds: 0,
    });
    expect(test.repository.session).toBeNull();
    expect(test.repository.events).toEqual([event]);
  });

  it('preserves the finished session when atomic completion fails', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'left');
    test.setTime(1_010_000);
    await finishTimer(test, 'child-1');
    test.repository.failCompletion = true;
    await expect(completeTimer(test, 'child-1')).rejects.toThrow();
    expect(test.repository.session?.status).toBe('finished');
    expect(test.repository.events).toEqual([]);
  });

  it('keeps a sub-second session recoverable instead of persisting an unsaveable finish', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'right');
    test.setTime(1_000_999);

    await expect(finishTimer(test, 'child-1')).rejects.toMatchObject({
      code: 'duration-too-short',
    });
    expect(test.repository.session).toMatchObject({
      status: 'running',
      activeSide: 'right',
      segmentStartedAtEpochMs: 1_000_000,
    });
  });

  it('pauses on clock rollback using one clock read and no invented elapsed time', async () => {
    const test = fixture();
    const started = await startTimer(test, 'child-1', 'left');
    test.setTime(999_000);
    const now = vi.spyOn(test.clock, 'now');

    const result = await recoverRunningTimerAfterClockRollback(
      test,
      'child-1',
      started.session as Extract<BreastfeedingTimerSession, { status: 'running' }>,
    );

    expect(now).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      clockMovedBackward: true,
      session: {
        status: 'paused',
        accumulatedLeftMs: 0,
        accumulatedRightMs: 0,
      },
    });
    expect(test.repository.session).toEqual(result.session);
  });

  it('persists the safe paused recovery when finish detects clock rollback', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'left');
    test.setTime(999_000);

    const result = await finishTimer(test, 'child-1');

    expect(result).toMatchObject({
      clockMovedBackward: true,
      session: { status: 'paused', resumeSide: 'left' },
    });
    expect(test.repository.session).toEqual(result.session);
  });

  it('reads exactly one clock value for each transition', async () => {
    const repository = new FakeRepository();
    const now = vi.fn(() => 1_000_000);
    const dependencies = {
      repository,
      clock: { now },
      idGenerator: { generate: () => 'session' },
    };
    await startTimer(dependencies, 'child', 'left');
    expect(now).toHaveBeenCalledOnce();
    now.mockClear();
    await switchTimerSide(dependencies, 'child');
    expect(now).toHaveBeenCalledOnce();

    await pauseTimer(dependencies, 'child');
    now.mockClear();
    await switchTimerSide(dependencies, 'child');
    expect(now).not.toHaveBeenCalled();
  });

  it.each(['running', 'paused', 'finished'] as const)(
    'discards the exact %s session without creating a feeding event',
    async (status) => {
      const test = fixture();
      const common = {
        sessionId: 'session-1', childId: 'child-1',
        accumulatedLeftMs: 10_000, accumulatedRightMs: 20_000,
      } as const;
      test.repository.session = status === 'running'
        ? { ...common, status, activeSide: 'left', segmentStartedAtEpochMs: 1_000_000 }
        : status === 'paused'
          ? { ...common, status, resumeSide: 'right' }
          : { ...common, status, finishedAtEpochMs: 2_000_000 };

      await discardTimer(test.repository, 'child-1');

      expect(test.repository.session).toBeNull();
      expect(test.repository.events).toEqual([]);
    },
  );

  it('preserves the timer when active-child ownership does not match', async () => {
    const test = fixture();
    await startTimer(test, 'child-1', 'left');
    const session = test.repository.session;

    await expect(discardTimer(test.repository, 'child-2')).rejects.toMatchObject({
      code: 'active-child-mismatch',
    });
    expect(test.repository.session).toBe(session);
  });
});
