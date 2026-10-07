import { describe, expect, it } from 'vitest';

import {
  activeSleepElapsedMs,
  createActiveSleepSession,
  createSleepEvent,
  sleepDurationMs,
} from './sleep';

describe('sleep domain', () => {
  it('creates canonical active sessions and derives elapsed time', () => {
    const session = createActiveSleepSession({
      id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 1_000,
    });
    expect(activeSleepElapsedMs(session, 61_000)).toEqual({
      elapsedMs: 60_000, clockMovedBackward: false,
    });
  });

  it('creates events and derives duration without storing it', () => {
    const event = createSleepEvent({
      id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 1_000,
      endedAtEpochMs: 91_000,
    });
    expect(sleepDurationMs(event)).toBe(90_000);
    expect(event).not.toHaveProperty('duration');
  });

  it.each([
    { id: '', childId: 'child', startedAtEpochMs: 0 },
    { id: 'id', childId: ' ', startedAtEpochMs: 0 },
    { id: 'id', childId: 'child', startedAtEpochMs: -1 },
    { id: 'id', childId: 'child', startedAtEpochMs: 1.5 },
    { id: 'id', childId: 'child', startedAtEpochMs: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid active session %#', (input) => {
    expect(() => createActiveSleepSession(input)).toThrow();
  });

  it.each([999, 1_000])('rejects end %s not after start', (endedAtEpochMs) => {
    expect(() => createSleepEvent({
      id: 'id', childId: 'child', startedAtEpochMs: 1_000, endedAtEpochMs,
    })).toThrow();
  });

  it('never derives negative elapsed time after a backward clock move', () => {
    expect(activeSleepElapsedMs({
      id: 'id', childId: 'child', startedAtEpochMs: 2_000,
    }, 1_000)).toEqual({ elapsedMs: 0, clockMovedBackward: true });
  });
});
