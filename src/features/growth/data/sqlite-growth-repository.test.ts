import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { createGrowthMeasurement, type GrowthMeasurement } from '../domain/growth-measurement';
import { SqliteGrowthRepository, type GrowthDatabase } from './sqlite-growth-repository';

function adapter(db: DatabaseSync): GrowthDatabase {
  return {
    async getFirstAsync<T>(sql: string, params: (string | number | null)[]) { return (db.prepare(sql).get(...params) as T | undefined) ?? null; },
    async getAllAsync<T>(sql: string, params: (string | number | null)[]) { return db.prepare(sql).all(...params) as T[]; },
    async runAsync(sql, params) { return { changes: Number((db.prepare(sql).run(...params) as { changes: number | bigint }).changes) }; },
  };
}
const original = createGrowthMeasurement({
  id: '00000000-0000-4000-8000-000000000001', childId: 'child', measuredOn: createCalendarDate('2024-02-29'),
  weightGrams: 3450, lengthMm: 512, headCircumferenceMm: 352, lengthMethod: 'lying', revision: 1,
});
describe('Growth SQLite repository', () => {
  let db: DatabaseSync;
  let repository: SqliteGrowthRepository;
  beforeEach(async () => {
    db = await createMigratedTestDatabase();
    db.exec("INSERT INTO children VALUES ('child', 'Mio', '2024-01-01'), ('other', 'Mira', '2024-01-01');");
    repository = new SqliteGrowthRepository(adapter(db));
  });
  afterEach(() => db.close());
  it('returns an empty terminal page and validates identities/cursors before SQL', async () => {
    await expect(repository.listHistory('child', 10)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(repository.getById('', 'id')).rejects.toThrow();
    await expect(repository.getById('child', ' ')).rejects.toThrow();
    await expect(repository.listHistory('child', 10, { childId: 'child', id: 'id', measuredOn: '2023-02-29' as never })).rejects.toThrow();
  });
  it('rejects an invalid actual calendar date stored with valid SQL date shape', async () => {
    db.exec("INSERT INTO growth_measurements (id,child_id,measured_on,weight_grams) VALUES ('invalid','child','2023-02-29',1);");
    await expect(repository.getById('child', 'invalid')).rejects.toThrow();
    await expect(repository.listHistory('child', 10)).rejects.toThrow();
    expect((db.prepare("SELECT measured_on FROM growth_measurements WHERE id='invalid'").get() as { measured_on: string }).measured_on).toBe('2023-02-29');
  });
  it('updates all editable fields while preserving ID and advancing revision exactly once', async () => {
    await repository.create(original);
    const replacement = createGrowthMeasurement({ ...original, revision: 2, measuredOn: createCalendarDate('2024-03-01'),
      weightGrams: null, lengthMm: null, lengthMethod: null, headCircumferenceMm: 360 });
    await expect(repository.updateIfMatches(original, replacement)).resolves.toBe(true);
    await expect(repository.getById('child', original.id)).resolves.toEqual(replacement);
  });
  it('persists and maps full/partial sessions, isolates children, and rejects duplicate IDs', async () => {
    await repository.create(original);
    await expect(repository.getById('child', original.id)).resolves.toEqual(original);
    await expect(repository.getById('other', original.id)).resolves.toBeNull();
    await expect(repository.create(original)).rejects.toThrow();
    expect((await repository.listHistory('child', 10)).items).toHaveLength(1);
    const partial = createGrowthMeasurement({ ...original, id: 'partial', lengthMm: null, lengthMethod: null });
    await repository.create(partial);
    await expect(repository.getById('child', 'partial')).resolves.toEqual(partial);
  });
  it('paginates same-day and historical sessions without missing/duplicate records', async () => {
    for (let i = 0; i < 57; i++) await repository.create({ ...original, id: String(i).padStart(3, '0'),
      measuredOn: createCalendarDate(i < 30 ? '2024-02-29' : '2024-03-01') });
    await repository.create({ ...original, id: 'foreign', childId: 'other' });
    const seen: string[] = [];
    let cursor = null as import('../application/growth-repository').GrowthHistoryCursor | null;
    do {
      const page = await repository.listHistory('child', 7, cursor);
      seen.push(...page.items.map(item => item.id)); cursor = page.nextCursor;
    } while (cursor);
    const expected = db.prepare('SELECT id FROM growth_measurements WHERE child_id = ? ORDER BY measured_on DESC, id DESC').all('child').map(row => (row as { id: string }).id);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(57);
    await expect(repository.listHistory('other', 7, { childId: 'child', id: '001', measuredOn: original.measuredOn })).rejects.toThrow();
    // Cursor is a tuple, not a lookup: deletion of its originating row does not invalidate it.
    const first = await repository.listHistory('child', 7);
    await repository.deleteIfMatches(first.items.at(-1)!);
    expect((await repository.listHistory('child', 7, first.nextCursor)).items[0].id).toBe(seen[7]);
  });
  it('allows only one competing revision update and protects delete/child ownership', async () => {
    await repository.create(original);
    const next = { ...original, revision: 2, weightGrams: 3500 };
    const results = await Promise.all([
      repository.updateIfMatches(original, next),
      repository.updateIfMatches(original, { ...next, weightGrams: 3600 }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(repository.deleteIfMatches(original)).resolves.toBe(false);
    await expect(repository.deleteIfMatches({ ...next, childId: 'other' })).resolves.toBe(false);
    await expect(repository.getById('child', original.id)).resolves.toEqual(next);
    await expect(repository.deleteIfMatches(next)).resolves.toBe(true);
    await expect(repository.deleteIfMatches(next)).resolves.toBe(false);
  });
  it('prevents ownership changes, revision skips and noninitial creation', async () => {
    await repository.create(original);
    for (const patch of [{ childId: 'other' }, { id: 'replacement' }, { revision: 1 }, { revision: 3 }]) {
      await expect(repository.updateIfMatches(original, { ...original, revision: 2, ...patch })).rejects.toThrow();
    }
    await expect(repository.create({ ...original, id: 'new', revision: 2 })).rejects.toThrow();
    await expect(repository.getById('child', original.id)).resolves.toEqual(original);
  });
  it.each([0, -1, 101, 1.5, NaN])('rejects invalid page size %s', async limit => {
    await expect(repository.listHistory('child', limit)).rejects.toThrow();
  });
  it.each([
    { measured_on: '2023-02-29' }, { weight_grams: '3450' }, { weight_grams: 3450.5 },
    { weight_grams: 0 }, { length_method: null }, { revision: '1' }, { revision: 0 },
    { child_id: 'other' }, { id: '' }, { head_circumference_mm: undefined },
  ])('rejects malformed persisted row %j', async patch => {
    const row = { id: original.id, child_id: 'child', measured_on: original.measuredOn,
      weight_grams: 3450, length_mm: 512, head_circumference_mm: 352, length_method: 'lying', revision: 1, ...patch };
    const malformed = new SqliteGrowthRepository({
      async getFirstAsync<T>() { return row as T; }, async getAllAsync<T>() { return [row] as T[]; },
      async runAsync() { return { changes: 0 }; },
    });
    await expect(malformed.getById('child', original.id)).rejects.toThrow();
    await expect(malformed.listHistory('child', 10)).rejects.toThrow();
  });
  it('propagates original read/write failures without automatic retries', async () => {
    const error = new Error('uncertain native failure');
    const getFirstAsync = vi.fn(async () => { throw error; });
    const getAllAsync = vi.fn(async () => { throw error; });
    const runAsync = vi.fn(async () => { throw error; });
    const failing = new SqliteGrowthRepository({ getFirstAsync, getAllAsync, runAsync });
    await expect(failing.create(original)).rejects.toBe(error);
    await expect(failing.getById('child', original.id)).rejects.toBe(error);
    await expect(failing.listHistory('child', 10)).rejects.toBe(error);
    await expect(failing.updateIfMatches(original, { ...original, revision: 2 })).rejects.toBe(error);
    await expect(failing.deleteIfMatches(original)).rejects.toBe(error);
    expect(runAsync).toHaveBeenCalledTimes(3);
    expect(getFirstAsync).toHaveBeenCalledOnce(); expect(getAllAsync).toHaveBeenCalledOnce();
  });
  it('binds parameters and performs no replacement upsert', async () => {
    const runAsync = vi.fn(async (_sql: string, _params: (string | number | null)[]) => ({ changes: 1 }));
    const bound = new SqliteGrowthRepository({ ...adapter(db), runAsync });
    await bound.create(original);
    expect(runAsync.mock.calls[0][0]).not.toMatch(/REPLACE|ON CONFLICT/);
    expect(runAsync.mock.calls[0][1]).toEqual([original.id, 'child', original.measuredOn, 3450, 512, 352, 'lying', 1]);
  });
});
