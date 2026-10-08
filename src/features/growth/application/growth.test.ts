import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { createGrowthMeasurement, type GrowthMeasurement } from '../domain/growth-measurement';
import type { GrowthRepository } from './growth-repository';
import { recordGrowth, readGrowthById, readGrowthHistory, updateGrowth, deleteGrowth, type GrowthValues } from './growth';

const date = createCalendarDate('2026-10-08');
const child = { id: 'a', displayName: 'Child', dateOfBirth: createCalendarDate('2026-02-28') };
const values: GrowthValues = {
  measuredOn: date, weightGrams: 4567, lengthMm: null, headCircumferenceMm: null, lengthMethod: null,
};
const original = createGrowthMeasurement({ ...values, id: 'id', childId: 'a', revision: 1 });
const editedValues = { ...values, weightGrams: 5678 };
const replacement = createGrowthMeasurement({ ...original, ...editedValues, revision: 2 });
function fixture() {
  let row: GrowthMeasurement | null = original;
  const repository: GrowthRepository = {
    create: vi.fn(async value => { row = value; }),
    getById: vi.fn(async () => row),
    listHistory: vi.fn(async () => ({ items: row ? [row] : [], nextCursor: null })),
    updateIfMatches: vi.fn(async (_expected, value) => { row = value; return true; }),
    deleteIfMatches: vi.fn(async () => { row = null; return true; }),
  };
  return { repository, set: (value: GrowthMeasurement | null) => { row = value; } };
}
function failure() { return new Error('private native details'); }

describe('Growth application', () => {
  it('records, reads, updates and deletes canonical integer sessions', async () => {
    const { repository } = fixture();
    expect(await recordGrowth(repository, { generate: () => 'id' }, child, date, values)).toEqual(original);
    expect(await readGrowthById(repository, 'a', 'id')).toEqual(original);
    expect((await readGrowthHistory(repository, 'a', 20)).items).toEqual([original]);
    expect(await updateGrowth(repository, child, date, original, editedValues)).toEqual(replacement);
    await deleteGrowth(repository, child, replacement);
    expect(await readGrowthById(repository, 'a', 'id')).toBeNull();
  });
  it.each(['2026-02-28', '2026-02-29', '2026-03-01', '2026-10-08'])('keeps the requested date %s without adjustment', async value => {
    const { repository } = fixture();
    if (value === '2026-02-29') {
      await expect(recordGrowth(repository, { generate: () => 'id' }, child, date,
        { ...values, measuredOn: value as typeof date })).rejects.toMatchObject({ code: 'invalid-measurement-date' });
    } else {
      const result = await recordGrowth(repository, { generate: () => 'id' }, child, date,
        { ...values, measuredOn: createCalendarDate(value) });
      expect(result.measuredOn).toBe(value);
    }
  });
  it.each([
    ['2026-02-27', 'measurement-before-birth'],
    ['2026-10-09', 'future-measurement'],
  ])('rejects date %s for create and update before writing', async (value, code) => {
    const { repository } = fixture();
    const input = { ...values, measuredOn: createCalendarDate(value) };
    await expect(recordGrowth(repository, { generate: () => 'id' }, child, date, input)).rejects.toMatchObject({ code });
    await expect(updateGrowth(repository, child, date, original, input)).rejects.toMatchObject({ code });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateIfMatches).not.toHaveBeenCalled();
  });
  it('uses exact leap-day calendar eligibility', async () => {
    const { repository } = fixture();
    const leap = createCalendarDate('2024-02-29');
    const result = await recordGrowth(repository, { generate: () => 'id' },
      { ...child, dateOfBirth: leap }, leap, { ...values, measuredOn: leap });
    expect(result.measuredOn).toBe(leap);
  });
  it('allows same-day sessions with distinct generated IDs', async () => {
    const { repository } = fixture();
    let id = 0;
    const generator = { generate: () => 'id-' + ++id };
    const first = await recordGrowth(repository, generator, child, date, values);
    const second = await recordGrowth(repository, generator, child, date, values);
    expect(first.measuredOn).toBe(second.measuredOn);
    expect(first.id).not.toBe(second.id);
  });
  it.each(['create', 'update', 'delete'] as const)('does not write when the final child guard rejects %s', async action => {
    const { repository } = fixture();
    const guard = () => { throw new Error('selection changed'); };
    const operation = action === 'create'
      ? recordGrowth(repository, { generate: () => 'id' }, child, date, values, guard)
      : action === 'update'
        ? updateGrowth(repository, child, date, original, editedValues, guard)
        : deleteGrowth(repository, child, original, guard);
    await expect(operation).rejects.toThrow('selection changed');
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateIfMatches).not.toHaveBeenCalled();
    expect(repository.deleteIfMatches).not.toHaveBeenCalled();
  });
  it.each(['update', 'delete'] as const)('distinguishes missing, conflict and foreign child before %s', async action => {
    const { repository, set } = fixture();
    const execute = (expected = original) => action === 'update'
      ? updateGrowth(repository, child, date, expected, editedValues)
      : deleteGrowth(repository, child, expected);
    set(null);
    await expect(execute()).rejects.toMatchObject({ code: 'measurement-not-found' });
    set(replacement);
    await expect(execute()).rejects.toMatchObject({ code: 'revision-conflict' });
    await expect(execute({ ...original, childId: 'b' })).rejects.toMatchObject({ code: 'revision-conflict' });
    expect(repository.updateIfMatches).not.toHaveBeenCalled();
    expect(repository.deleteIfMatches).not.toHaveBeenCalled();
  });
  it.each([
    ['matching', 'success'],
    ['absent', 'create-not-saved'],
    ['different', 'mutation-outcome-uncertain'],
    ['unreadable', 'mutation-outcome-uncertain'],
  ])('reconciles create: %s, without another INSERT or ID allocation', async (state, outcome) => {
    const { repository, set } = fixture();
    const generator = { generate: vi.fn(() => 'id') };
    vi.mocked(repository.create).mockImplementation(async () => {
      set(state === 'absent' ? null : state === 'different' ? replacement : original);
      throw failure();
    });
    if (state === 'unreadable') vi.mocked(repository.getById).mockRejectedValue(failure());
    const operation = recordGrowth(repository, generator, child, date, values);
    if (outcome === 'success') expect(await operation).toEqual(original);
    else await expect(operation).rejects.toMatchObject({ code: outcome, pendingMeasurement: original, message: 'The growth operation is not available.' });
    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(repository.getById).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['replacement', 'success'],
    ['original', 'update-not-applied'],
    ['newer', 'revision-conflict'],
    ['same-new-revision-different-payload', 'mutation-outcome-uncertain'],
    ['same-original-revision-different-payload', 'mutation-outcome-uncertain'],
    ['absent', 'mutation-outcome-uncertain'],
    ['unreadable', 'mutation-outcome-uncertain'],
  ])('reconciles thrown update: %s', async (state, outcome) => {
    const { repository, set } = fixture();
    vi.mocked(repository.updateIfMatches).mockImplementation(async () => {
      if (state === 'unreadable') vi.mocked(repository.getById).mockRejectedValue(failure());
      else set(state === 'absent' ? null : state === 'original' ? original :
        state === 'newer' ? { ...replacement, revision: 3 } :
        state === 'same-new-revision-different-payload' ? { ...replacement, weightGrams: 6789 } :
        state === 'same-original-revision-different-payload' ? { ...original, weightGrams: 6789 } : replacement);
      throw failure();
    });
    const operation = updateGrowth(repository, child, date, original, editedValues);
    if (outcome === 'success') expect(await operation).toEqual(replacement);
    else await expect(operation).rejects.toMatchObject({ code: outcome, pendingMeasurement: replacement });
    expect(repository.updateIfMatches).toHaveBeenCalledTimes(1);
    expect(repository.getById).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['absent', 'success'],
    ['original', 'delete-not-applied'],
    ['newer', 'revision-conflict'],
    ['same-revision-different-payload', 'mutation-outcome-uncertain'],
    ['unreadable', 'mutation-outcome-uncertain'],
  ])('reconciles thrown delete: %s', async (state, outcome) => {
    const { repository, set } = fixture();
    vi.mocked(repository.deleteIfMatches).mockImplementation(async () => {
      if (state === 'unreadable') vi.mocked(repository.getById).mockRejectedValue(failure());
      else set(state === 'absent' ? null : state === 'newer' ? replacement :
        state === 'same-revision-different-payload' ? { ...original, weightGrams: 6789 } : original);
      throw failure();
    });
    const operation = deleteGrowth(repository, child, original);
    if (outcome === 'success') await expect(operation).resolves.toBeUndefined();
    else await expect(operation).rejects.toMatchObject({ code: outcome, pendingMeasurement: original });
    expect(repository.deleteIfMatches).toHaveBeenCalledTimes(1);
    expect(repository.getById).toHaveBeenCalledTimes(2);
  });
  it.each(['update', 'delete'] as const)('classifies a reliable failed conditional %s', async action => {
    const { repository, set } = fixture();
    const method = action === 'update' ? repository.updateIfMatches : repository.deleteIfMatches;
    vi.mocked(method).mockResolvedValue(false);
    const execute = () => action === 'update'
      ? updateGrowth(repository, child, date, original, editedValues)
      : deleteGrowth(repository, child, original);
    await expect(execute()).rejects.toMatchObject({ code: action + '-not-applied' });
    vi.mocked(method).mockImplementation(async () => { set(null); return false; });
    if (action === 'delete') await expect(execute()).resolves.toBeUndefined();
    else await expect(execute()).rejects.toMatchObject({ code: 'measurement-not-found' });
  });
  it('maps read failures without exposing technical internals', async () => {
    const { repository } = fixture();
    vi.mocked(repository.getById).mockRejectedValue(failure());
    vi.mocked(repository.listHistory).mockRejectedValue(failure());
    await expect(readGrowthById(repository, 'a', 'id')).rejects.toMatchObject({ code: 'local-data-unavailable', message: 'The growth operation is not available.' });
    await expect(readGrowthHistory(repository, 'a', 20)).rejects.toMatchObject({ code: 'local-data-unavailable' });
  });
  it('rejects invalid units and revision overflow without a write', async () => {
    const { repository, set } = fixture();
    await expect(recordGrowth(repository, { generate: () => 'id' }, child, date, { ...values, weightGrams: 1.5 }))
      .rejects.toMatchObject({ code: 'invalid-weight' });
    const maximum = { ...original, revision: Number.MAX_SAFE_INTEGER };
    set(maximum);
    await expect(updateGrowth(repository, child, date, maximum, editedValues)).rejects.toMatchObject({ code: 'invalid-revision' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateIfMatches).not.toHaveBeenCalled();
  });
});
