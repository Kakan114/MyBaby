import { describe, expect, it } from 'vitest';

import {
  finishBreastfeedingTimer,
  pauseBreastfeedingTimer,
  projectBreastfeedingDuration,
  resumeBreastfeedingTimer,
  startBreastfeedingTimer,
  switchBreastfeedingTimer,
  timerDurationSeconds,
} from './breastfeeding-timer';

const START = 1_000_000;

describe('breastfeeding timer state machine', () => {
  it.each(['left', 'right'] as const)('starts %s at an epoch anchor', (side) => {
    expect(startBreastfeedingTimer('session', 'child', side, START)).toEqual({
      sessionId: 'session', childId: 'child', status: 'running', activeSide: side,
      accumulatedLeftMs: 0, accumulatedRightMs: 0,
      segmentStartedAtEpochMs: START,
    });
  });

  it('projects elapsed time from the clock without mutating canonical state', () => {
    const session = startBreastfeedingTimer('session', 'child', 'left', START);
    expect(projectBreastfeedingDuration(session, START + 90_500)).toEqual({
      leftMs: 90_500, rightMs: 0, clockMovedBackward: false,
    });
    expect(session.accumulatedLeftMs).toBe(0);
  });

  it('pauses, excludes paused time, and resumes the remembered side', () => {
    const running = startBreastfeedingTimer('session', 'child', 'right', START);
    const paused = pauseBreastfeedingTimer(running, START + 10_000).session;
    expect(paused).toMatchObject({
      status: 'paused', resumeSide: 'right', accumulatedRightMs: 10_000,
    });
    expect(projectBreastfeedingDuration(paused, START + 100_000).rightMs).toBe(10_000);
    if (paused.status !== 'paused') throw new Error('Expected paused timer.');
    const resumed = resumeBreastfeedingTimer(paused, START + 100_000);
    expect(projectBreastfeedingDuration(resumed, START + 105_000).rightMs).toBe(15_000);
  });

  it('switches repeatedly using one clock value per segment', () => {
    const left = startBreastfeedingTimer('session', 'child', 'left', START);
    const right = switchBreastfeedingTimer(left, START + 10_000).session;
    if (right.status !== 'running') throw new Error('Expected running timer.');
    expect(right).toMatchObject({
      activeSide: 'right', accumulatedLeftMs: 10_000,
      segmentStartedAtEpochMs: START + 10_000,
    });
    const leftAgain = switchBreastfeedingTimer(right, START + 30_000).session;
    if (leftAgain.status !== 'running') throw new Error('Expected running timer.');
    const final = switchBreastfeedingTimer(leftAgain, START + 35_000).session;
    expect(final).toMatchObject({
      activeSide: 'right', accumulatedLeftMs: 15_000, accumulatedRightMs: 20_000,
    });
  });

  it('switches the resume side while paused without adding time', () => {
    const running = startBreastfeedingTimer('session', 'child', 'left', START);
    const paused = pauseBreastfeedingTimer(running, START + 5_000).session;
    if (paused.status !== 'paused') throw new Error('Expected paused timer.');
    expect(switchBreastfeedingTimer(paused).session).toEqual({
      ...paused,
      resumeSide: 'right',
    });
  });

  it('uses background-style clock advancement without timer ticks', () => {
    const session = startBreastfeedingTimer('session', 'child', 'left', START);
    expect(pauseBreastfeedingTimer(session, START + 20 * 60_000).session)
      .toMatchObject({ accumulatedLeftMs: 20 * 60_000 });
  });

  it('freezes safely when the wall clock moves backward', () => {
    const session = startBreastfeedingTimer('session', 'child', 'left', START);
    const result = pauseBreastfeedingTimer(session, START - 1);
    expect(result.clockMovedBackward).toBe(true);
    expect(result.session).toMatchObject({
      status: 'paused', accumulatedLeftMs: 0, resumeSide: 'left',
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid clock value %s',
    (clock) => expect(() => startBreastfeedingTimer(
      'session', 'child', 'left', clock,
    )).toThrow(expect.objectContaining({ code: 'invalid-timer-state' })),
  );

  it('rejects invalid runtime side and state values from an untrusted boundary', () => {
    expect(() => startBreastfeedingTimer(
      'session', 'child', 'middle' as 'left', START,
    )).toThrow(expect.objectContaining({ code: 'invalid-timer-state' }));
    expect(() => projectBreastfeedingDuration({
      sessionId: 'session', childId: 'child', status: 'unknown',
      accumulatedLeftMs: 0, accumulatedRightMs: 0,
    } as never, START)).toThrow(
      expect.objectContaining({ code: 'invalid-timer-state' }),
    );
  });

  it('finishes running and paused sessions and freezes the finish epoch', () => {
    const running = startBreastfeedingTimer('session', 'child', 'left', START);
    const finishedRunning = finishBreastfeedingTimer(running, START + 2_999).session;
    expect(finishedRunning).toMatchObject({
      status: 'finished', accumulatedLeftMs: 2_999, finishedAtEpochMs: START + 2_999,
    });

    const paused = pauseBreastfeedingTimer(running, START + 5_000).session;
    if (paused.status !== 'paused') throw new Error('Expected paused timer.');
    expect(finishBreastfeedingTimer(paused, START + 50_000).session).toMatchObject({
      status: 'finished', accumulatedLeftMs: 5_000,
      finishedAtEpochMs: START + 50_000,
    });
  });

  it('floors milliseconds once per side and rejects two zero-second totals', () => {
    const running = startBreastfeedingTimer('session', 'child', 'left', START);
    const finished = finishBreastfeedingTimer(running, START + 1_999).session;
    if (finished.status !== 'finished') throw new Error('Expected finished timer.');
    expect(timerDurationSeconds(finished)).toEqual({
      leftDurationSeconds: 1, rightDurationSeconds: 0,
    });

    const tooShort = finishBreastfeedingTimer(running, START + 999).session;
    if (tooShort.status !== 'finished') throw new Error('Expected finished timer.');
    expect(() => timerDurationSeconds(tooShort)).toThrow(
      expect.objectContaining({ code: 'duration-too-short' }),
    );
  });
});
