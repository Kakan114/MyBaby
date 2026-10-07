import { describe, expect, it, vi } from 'vitest';
import { createTodayRuntime } from './create-today-runtime';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { ActiveChildDependencies } from '../../children/application/active-child';
import type { TodayReadRepositories } from '../application/get-today-summary';

const now = Date.parse('2026-10-07T12:00:00Z');
const day = {
  calendarDate: createCalendarDate('2026-10-07'), timeZone: 'UTC',
  startEpochMs: Date.parse('2026-10-07T00:00:00Z'),
  endEpochMs: Date.parse('2026-10-08T00:00:00Z'),
};
function fixture() {
  let held = false;
  const checkQueue = () => { expect(held).toBe(true); };
  const repositories: ActiveChildDependencies & TodayReadRepositories = {
    activeChildRepository: {
      getActiveChildId: vi.fn(async () => { checkQueue(); return 'child'; }),
      setActiveChildId: vi.fn(), setActiveChildIdIfUnset: vi.fn(), clearActiveChildIdIfMatches: vi.fn(),
    },
    childRepository: {
      getById: async () => ({ id: 'child', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-10-06') }),
      save: vi.fn(), hasChildren: vi.fn(), listChildren: vi.fn(),
    },
    feeding: { getCompletedSummary: async () => {
      checkQueue(); return { dayCount: 0, latestCompletedAtEpochMs: null };
    } },
    diapers: { getEventSummary: async () => {
      checkQueue(); return { dayCount: 0, latestOccurredAtEpochMs: null };
    } },
    sleep: {
      listCompletedOverlapping: async () => { checkQueue(); return []; },
      getActiveByChildId: async () => { checkQueue(); return null; },
    },
  };
  const queueCalls = vi.fn();
  const operationCalls = vi.fn();
  const clock = vi.fn(() => { checkQueue(); return now; });
  const context = vi.fn(() => { checkQueue(); return day; });
  const error = new Error('Safe local-data error');
  const initialize = vi.fn(async () => repositories);
  const runtime = createTodayRuntime({
    async runOperation<T>(operation: () => Promise<T>) {
      operationCalls(); return operation();
    },
    async withDatabaseQueue<T>(operation: () => Promise<T>) {
      queueCalls();
      if (held) throw new Error('Nested queue acquisition');
      held = true;
      try { return await operation(); } finally { held = false; }
    },
    initialize, readEpochClock: clock, getLocalDayContext: context,
    localDataError: () => error,
  });
  return { runtime, repositories, queueCalls, operationCalls, clock, context, initialize, error };
}

describe('Today runtime orchestration', () => {
  it('acquires the queue exactly once, captures one clock and resolves one child', async () => {
    const f = fixture();
    expect(await f.runtime.getSummary()).toMatchObject({ status: 'ready' });
    expect(f.queueCalls).toHaveBeenCalledOnce();
    expect(f.operationCalls).toHaveBeenCalledOnce();
    expect(f.clock).toHaveBeenCalledOnce();
    expect(f.context).toHaveBeenCalledWith(now);
    expect(f.repositories.activeChildRepository.getActiveChildId).toHaveBeenCalledOnce();
  });

  it('sanitizes failure, releases the queue and reacquires once on retry', async () => {
    const f = fixture();
    f.clock.mockImplementationOnce(() => { throw new Error('private clock failure'); });
    await expect(f.runtime.getSummary()).rejects.toBe(f.error);
    expect(await f.runtime.getSummary()).toMatchObject({ status: 'ready' });
    expect(f.queueCalls).toHaveBeenCalledTimes(2);
  });

  it('sanitizes initialization failure before trying to acquire a queue', async () => {
    const f = fixture();
    f.initialize.mockRejectedValueOnce(new Error('secret SQLCipher key'));
    await expect(f.runtime.getSummary()).rejects.toBe(f.error);
    expect(f.queueCalls).not.toHaveBeenCalled();
    expect(await f.runtime.getSummary()).toMatchObject({ status: 'ready' });
  });
});
