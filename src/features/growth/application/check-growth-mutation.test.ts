import { describe, expect, it, vi } from 'vitest';
import { checkGrowthMutation } from './growth';
import type { GrowthRepository } from './growth-repository';
import { createGrowthMeasurement } from '../domain/growth-measurement';
import { createCalendarDate } from '../../children/domain/calendar-date';

const original = createGrowthMeasurement({ id: 'id', childId: 'a', revision: 1, measuredOn: createCalendarDate('2026-10-08'),
  weightGrams: 4567, lengthMm: null, headCircumferenceMm: null, lengthMethod: null });
const next = createGrowthMeasurement({ ...original, revision: 2, weightGrams: 5000 });
describe('read-only Growth mutation status', () => {
  it.each([
    ['record', 'absent', 'not-applied'], ['record', 'matching', 'success'], ['record', 'different', 'uncertain'],
    ['update', 'matching', 'success'], ['update', 'original', 'not-applied'], ['update', 'newer', 'conflict'],
    ['update', 'different', 'uncertain'], ['update', 'absent', 'uncertain'],
    ['delete', 'absent', 'success'], ['delete', 'original', 'not-applied'], ['delete', 'newer', 'conflict'],
  ] as const)('classifies %s with %s through a single read', async (action, row, status) => {
    const attempt = action === 'update' ? next : original;
    const canonical = row === 'absent' ? null : row === 'matching' ? attempt : row === 'original' ? original :
      row === 'newer' ? { ...next, revision: 3 } : { ...attempt, weightGrams: 6000 };
    const read = vi.fn(async () => canonical);
    const never = vi.fn(async (): Promise<never> => { throw new Error('must not write'); });
    const repository: GrowthRepository = { getById: read, create: never, listHistory: never, updateIfMatches: never, deleteIfMatches: never };
    expect(await checkGrowthMutation(repository, { action, attempt, expected: action === 'record' ? undefined : original })).toEqual({ status });
    expect(read).toHaveBeenCalledExactlyOnceWith('a', 'id');
    expect(never).not.toHaveBeenCalled();
  });
  it('preserves pending payload on status read failure', async () => {
    const never = vi.fn(async (): Promise<never> => { throw new Error('private SQLCipher data'); });
    const repository: GrowthRepository = { getById: never, create: never, listHistory: never, updateIfMatches: never, deleteIfMatches: never };
    await expect(checkGrowthMutation(repository, { action: 'record', attempt: original }))
      .rejects.toMatchObject({ code: 'mutation-outcome-uncertain', pendingMeasurement: original, message: 'The growth operation is not available.' });
    expect(never).toHaveBeenCalledTimes(1);
  });
});
