import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { createGrowthMeasurement } from '../domain/growth-measurement';
import { createGrowthRuntime } from './create-growth-runtime';

it('checks a pending create once in the shared queue without allocating an ID or writing', async () => {
  const value = createGrowthMeasurement({ id: 'pending-id', childId: 'a', revision: 1, measuredOn: createCalendarDate('2026-10-08'),
    weightGrams: 4567, lengthMm: null, headCircumferenceMm: null, lengthMethod: null });
  const child = { id: 'a', displayName: 'Child', dateOfBirth: createCalendarDate('2026-01-01') };
  const scope = {};
  const context = { childId: 'a', selectionVersion: 0, selectionScope: scope };
  const write = vi.fn(async (): Promise<never> => { throw new Error('unexpected write'); });
  const read = vi.fn(async () => value);
  const queue = vi.fn(); const operation = vi.fn();
  const runtime = createGrowthRuntime({
    runOperation: async run => { operation(); return run(); },
    withDatabaseQueue: async run => { queue(); return run(); },
    selection: { scope, getVersion: () => 0, isChanging: () => false, subscribe: () => () => {} },
    idGenerator: { generate: () => { throw new Error('must not allocate'); } },
    getCurrentCalendarDate: () => createCalendarDate('2026-10-08'),
    initialize: async () => ({
      childRepository: { getById: async () => child, hasChildren: async () => true, listChildren: async () => [child], save: write },
      activeChildRepository: { getActiveChildId: async () => 'a', setActiveChildId: write, setActiveChildIdIfUnset: write, clearActiveChildIdIfMatches: write },
      growthRepository: { getById: read, create: write, listHistory: write, updateIfMatches: write, deleteIfMatches: write },
    }),
  });
  expect((await runtime.checkMutation(context, { action: 'record', attempt: value })).value.status).toBe('success');
  expect(queue).toHaveBeenCalledTimes(1); expect(operation).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledExactlyOnceWith('a', 'pending-id');
  expect(write).not.toHaveBeenCalled();
  await expect(runtime.checkMutation(context, { action: 'record', attempt: { ...value, childId: 'b' } }))
    .rejects.toMatchObject({ code: 'stale-child-context' });
  expect(read).toHaveBeenCalledTimes(1);
});
