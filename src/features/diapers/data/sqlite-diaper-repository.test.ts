import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { SqliteDiaperRepository, type DiaperDatabase } from './sqlite-diaper-repository';

function adapter(database: DatabaseSync): DiaperDatabase {
  return {
    async getAllAsync<T>(sql: string, params: any[]) { return database.prepare(sql).all(...params) as T[]; },
    async getFirstAsync<T>(sql: string, params: any[]) { return (database.prepare(sql).get(...params) as T | undefined) ?? null; },
    async runAsync(sql: string, params: any[]) {
      const result = database.prepare(sql).run(...params) as { changes: number | bigint };
      return { changes: Number(result.changes) };
    },
  };
}

describe('SqliteDiaperRepository', () => {
  let database: DatabaseSync;
  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.prepare('INSERT INTO children (id, display_name, date_of_birth) VALUES (?, ?, ?)')
      .run('child-1', 'Mio', '2025-01-01');
    database.prepare('INSERT INTO children (id, display_name, date_of_birth) VALUES (?, ?, ?)')
      .run('child-2', 'Mira', '2025-01-02');
  });
  afterEach(() => database.close());

  it('uses a bound plain INSERT and maps getById', async () => {
    const runAsync = vi.fn(async () => ({ changes: 1 }));
    const repository = new SqliteDiaperRepository({
      runAsync, async getAllAsync() { return []; }, async getFirstAsync() { return null; },
    });
    await repository.save({ id: 'event', childId: 'child-1', occurredAtEpochMs: 123, kind: 'wet' });
    const [sql, params] = runAsync.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO diaper_events');
    expect(sql).not.toMatch(/REPLACE|ON CONFLICT/);
    expect(params).toEqual(['event', 'child-1', 123, 'wet']);
    const real = new SqliteDiaperRepository(adapter(database));
    await real.save({ id: 'event', childId: 'child-1', occurredAtEpochMs: 123, kind: 'wet' });
    await expect(real.getById('child-1', 'event')).resolves.toEqual({
      id: 'event', childId: 'child-1', occurredAtEpochMs: 123, kind: 'wet',
    });
    await expect(real.getById('child-2', 'event')).resolves.toBeNull();
  });

  it('isolates children, orders by occurrence then ID, and enforces the limit', async () => {
    const repository = new SqliteDiaperRepository(adapter(database));
    await repository.save({ id: 'a', childId: 'child-1', occurredAtEpochMs: 100, kind: 'wet' });
    await repository.save({ id: 'b', childId: 'child-1', occurredAtEpochMs: 100, kind: 'dirty' });
    await repository.save({ id: 'c', childId: 'child-1', occurredAtEpochMs: 200, kind: 'mixed' });
    await repository.save({ id: 'other', childId: 'child-2', occurredAtEpochMs: 999, kind: 'wet' });
    await expect(repository.listRecentByChildId('child-1', 2)).resolves.toEqual([
      { id: 'c', childId: 'child-1', occurredAtEpochMs: 200, kind: 'mixed' },
      { id: 'b', childId: 'child-1', occurredAtEpochMs: 100, kind: 'dirty' },
    ]);
  });

  it('binds child identity, event identity, and history limit in read queries', async () => {
    const calls: Array<readonly [string, readonly unknown[]]> = [];
    const repository = new SqliteDiaperRepository({
      async runAsync() { return { changes: 0 }; },
      async getFirstAsync<T>(sql: string, params: any[]) { calls.push([sql, params]); return null as T | null; },
      async getAllAsync<T>(sql: string, params: any[]) { calls.push([sql, params]); return [] as T[]; },
    });
    await repository.getById('child-1', 'event-1');
    await repository.listRecentByChildId('child-1', 20);
    expect(calls[0]?.[0]).toContain('WHERE child_id = ? AND id = ?');
    expect(calls[0]?.[1]).toEqual(['child-1', 'event-1']);
    expect(calls[1]?.[0]).toContain('ORDER BY occurred_at_epoch_ms DESC, id DESC');
    expect(calls[1]?.[0]).toContain('LIMIT ?');
    expect(calls[1]?.[1]).toEqual(['child-1', 20]);
  });

  it('conditionally deletes only an exact child-owned persisted snapshot', async () => {
    const repository = new SqliteDiaperRepository(adapter(database));
    const original = {
      id: 'event', childId: 'child-1', occurredAtEpochMs: 123, kind: 'wet' as const,
    };
    await repository.save(original);
    await expect(repository.deleteIfMatches({ ...original, childId: 'child-2' })).resolves.toBe(false);
    await expect(repository.deleteIfMatches({ ...original, occurredAtEpochMs: 124 })).resolves.toBe(false);
    await expect(repository.deleteIfMatches({ ...original, kind: 'dirty' })).resolves.toBe(false);
    await expect(repository.getById('child-1', 'event')).resolves.toEqual(original);
    await expect(repository.deleteIfMatches(original)).resolves.toBe(true);
    await expect(repository.getById('child-1', 'event')).resolves.toBeNull();
  });

  it('conditionally updates kind and time in place without changing ID or child', async () => {
    const repository = new SqliteDiaperRepository(adapter(database));
    const original = {
      id: 'event', childId: 'child-1', occurredAtEpochMs: 123, kind: 'wet' as const,
    };
    const replacement = { ...original, occurredAtEpochMs: 456, kind: 'mixed' as const };
    await repository.save(original);
    await expect(repository.updateIfMatches(
      { ...original, kind: 'dirty' }, replacement,
    )).resolves.toBe(false);
    await expect(repository.updateIfMatches(original, replacement)).resolves.toBe(true);
    await expect(repository.getById('child-1', 'event')).resolves.toEqual(replacement);
    await expect(repository.updateIfMatches(
      replacement, { ...replacement, childId: 'child-2' },
    )).rejects.toThrow();
  });

  it('uses bound values for conditional delete and update', async () => {
    const runAsync = vi.fn(async () => ({ changes: 1 }));
    const repository = new SqliteDiaperRepository({
      runAsync, async getAllAsync() { return []; }, async getFirstAsync() { return null; },
    });
    const original = {
      id: 'event', childId: 'child-1', occurredAtEpochMs: 123, kind: 'wet' as const,
    };
    const replacement = { ...original, occurredAtEpochMs: 456, kind: 'dirty' as const };
    await repository.deleteIfMatches(original);
    await repository.updateIfMatches(original, replacement);
    const deleteCall = runAsync.mock.calls[0] as unknown as [string, unknown[]];
    const updateCall = runAsync.mock.calls[1] as unknown as [string, unknown[]];
    expect(deleteCall[0]).toContain(
      'WHERE id = ? AND child_id = ? AND occurred_at_epoch_ms = ? AND kind = ?',
    );
    expect(deleteCall[1]).toEqual(['event', 'child-1', 123, 'wet']);
    expect(updateCall[0]).toContain('SET occurred_at_epoch_ms = ?, kind = ?');
    expect(updateCall[1]).toEqual([456, 'dirty', 'event', 'child-1', 123, 'wet']);
  });

  it('rejects malformed rows and enforces schema constraints and cascade', async () => {
    const malformed = new SqliteDiaperRepository({
      async runAsync() { return { changes: 0 }; }, async getFirstAsync() { return null; },
      async getAllAsync<T>() { return [{ id: 'x', child_id: 'other', occurred_at_epoch_ms: 1, kind: 'wet' }] as T[]; },
    });
    await expect(malformed.listRecentByChildId('child-1', 20)).rejects.toThrow();
    const insert = database.prepare('INSERT INTO diaper_events (id, child_id, occurred_at_epoch_ms, kind) VALUES (?, ?, ?, ?)');
    expect(() => insert.run('bad-kind', 'child-1', 1, 'other')).toThrow();
    expect(() => insert.run('real-time', 'child-1', 1.5, 'wet')).toThrow();
    expect(() => insert.run('missing', 'missing', 1, 'wet')).toThrow();
    insert.run('ok', 'child-1', 1, 'dirty');
    database.prepare('DELETE FROM children WHERE id = ?').run('child-1');
    expect(database.prepare('SELECT count(*) count FROM diaper_events').get()).toEqual({ count: 0 });
  });

  it('has the history index', () => {
    const rows = database.prepare("PRAGMA index_list('diaper_events')").all() as { name: string }[];
    expect(rows.map(({ name }) => name)).toContain('diaper_events_child_occurred_id_idx');
  });
});
