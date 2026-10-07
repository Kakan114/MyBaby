import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import type { ActiveSleepSession, SleepEvent } from '../domain/sleep';
import { SqliteSleepRepository, type SleepDatabase } from './sqlite-sleep-repository';

type Options = Readonly<{ failSql?: string; throwAfterCommit?: boolean }>;

function adapter(database: DatabaseSync, options: Options = {}): SleepDatabase {
  const values = (params: unknown[]) => params.map((value) =>
    value instanceof ArrayBuffer ? new Uint8Array(value) : value) as [];
  return {
    async execAsync(source) {
      if (source.includes(options.failSql ?? '\u0000')) throw new Error('injected failure');
      database.exec(source);
      if (source === 'COMMIT;' && options.throwAfterCommit) throw new Error('uncertain commit');
    },
    async getAllAsync<T>(source: string, params: unknown[]) {
      return database.prepare(source).all(...values(params)) as T[];
    },
    async getFirstAsync<T>(source: string, params: unknown[]) {
      return (database.prepare(source).get(...values(params)) as T | undefined) ?? null;
    },
    async runAsync(source: string, params: unknown[]) {
      if (source.includes(options.failSql ?? '\u0000')) throw new Error('injected failure');
      const result = database.prepare(source).run(...values(params)) as { changes: number | bigint };
      return { changes: Number(result.changes) };
    },
  } as SleepDatabase;
}

describe('SqliteSleepRepository', () => {
  let database: DatabaseSync;
  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.exec('PRAGMA foreign_keys = ON;');
    database.prepare('INSERT INTO children (id, display_name, date_of_birth) VALUES (?, ?, ?);')
      .run('child-1', 'Mio', '2025-01-10');
    database.prepare('INSERT INTO children (id, display_name, date_of_birth) VALUES (?, ?, ?);')
      .run('child-2', 'Mira', '2025-02-10');
  });
  afterEach(() => database.close());

  it('persists separate active sessions per child and maps them defensively', async () => {
    const repository = new SqliteSleepRepository(adapter(database));
    const first = { id: 'a', childId: 'child-1', startedAtEpochMs: 100 };
    const second = { id: 'b', childId: 'child-2', startedAtEpochMs: 200 };
    await repository.createActive(first);
    await repository.createActive(second);
    await expect(repository.getActiveByChildId('child-1')).resolves.toEqual(first);
    await expect(repository.getActiveByChildId('child-2')).resolves.toEqual(second);
    await expect(repository.createActive({ ...first, id: 'duplicate' })).rejects.toThrow();
  });

  it('atomically inserts the event with the session ID and deletes the exact session', async () => {
    const repository = new SqliteSleepRepository(adapter(database));
    const session: ActiveSleepSession = {
      id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 100,
    };
    const event: SleepEvent = { ...session, endedAtEpochMs: 500 };
    await repository.createActive(session);
    await repository.complete(session, event);
    await expect(repository.getActiveByChildId('child-1')).resolves.toBeNull();
    await expect(repository.getEventById('child-1', 'sleep-1')).resolves.toEqual(event);
  });

  it.each(['INSERT INTO sleep_events', 'DELETE FROM active_sleep_sessions'])(
    'rolls back both sides when completion fails at %s', async (failSql) => {
      const setup = new SqliteSleepRepository(adapter(database));
      const session = { id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 100 };
      await setup.createActive(session);
      const repository = new SqliteSleepRepository(adapter(database, { failSql }));
      await expect(repository.complete(session, { ...session, endedAtEpochMs: 500 }))
        .rejects.toThrow();
      await expect(setup.getActiveByChildId('child-1')).resolves.toEqual(session);
      await expect(setup.getEventById('child-1', 'sleep-1')).resolves.toBeNull();
    },
  );

  it('supports canonical recovery after an uncertain COMMIT response', async () => {
    const setup = new SqliteSleepRepository(adapter(database));
    const session = { id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 100 };
    await setup.createActive(session);
    const uncertain = new SqliteSleepRepository(adapter(database, { throwAfterCommit: true }));
    await expect(uncertain.complete(session, { ...session, endedAtEpochMs: 500 }))
      .rejects.toThrow();
    await expect(setup.getActiveByChildId('child-1')).resolves.toBeNull();
    await expect(setup.getEventById('child-1', 'sleep-1')).resolves.toMatchObject({
      endedAtEpochMs: 500,
    });
  });

  it('isolates children and orders a bounded history by end then ID descending', async () => {
    const repository = new SqliteSleepRepository(adapter(database));
    for (let index = 0; index < 22; index += 1) {
      const session = {
        id: `sleep-${String(index).padStart(2, '0')}`,
        childId: 'child-1', startedAtEpochMs: index + 1,
      };
      await repository.createActive(session);
      await repository.complete(session, {
        ...session, endedAtEpochMs: index < 2 ? 100 : index + 10,
      });
    }
    const other = { id: 'other', childId: 'child-2', startedAtEpochMs: 1 };
    await repository.createActive(other);
    await repository.complete(other, { ...other, endedAtEpochMs: 999 });
    const events = await repository.listRecentByChildId('child-1', 20);
    expect(events).toHaveLength(20);
    expect(events.slice(0, 2).map(({ id }) => id)).toEqual(['sleep-01', 'sleep-00']);
    expect(events.every(({ childId }) => childId === 'child-1')).toBe(true);
  });

  it('binds the child and product limit and rejects malformed persisted rows', async () => {
    const calls: Array<readonly [string, readonly unknown[]]> = [];
    const repository = new SqliteSleepRepository({
      async execAsync() { return undefined; },
      async runAsync() { return { changes: 1 }; },
      async getFirstAsync() { return null; },
      async getAllAsync<T>(source: string, params: unknown[]) {
        calls.push([source, params]);
        return [{
          id: 'bad', child_id: 'other-child', started_at_epoch_ms: 1,
          ended_at_epoch_ms: 2,
        }] as T[];
      },
    });
    await expect(repository.listRecentByChildId('child-1', 20)).rejects.toThrow();
    expect(calls[0]?.[0]).toContain('WHERE child_id = ?');
    expect(calls[0]?.[0]).toContain('ORDER BY ended_at_epoch_ms DESC, id DESC');
    expect(calls[0]?.[0]).toContain('LIMIT ?');
    expect(calls[0]?.[1]).toEqual(['child-1', 20]);
  });

  it('enforces timestamps, ownership, exact discard, and child cascade', async () => {
    const repository = new SqliteSleepRepository(adapter(database));
    await expect(repository.createActive({
      id: 'missing', childId: 'missing', startedAtEpochMs: 1,
    })).rejects.toThrow();
    expect(() => database.prepare(`
      INSERT INTO sleep_events (id, child_id, started_at_epoch_ms, ended_at_epoch_ms)
      VALUES (?, ?, ?, ?);
    `).run('bad', 'child-1', 1.5, 2)).toThrow();
    const session = { id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 1 };
    await repository.createActive(session);
    await expect(repository.discard('child-1', 'wrong')).rejects.toThrow();
    await repository.complete(session, { ...session, endedAtEpochMs: 2 });
    database.prepare('DELETE FROM children WHERE id = ?;').run('child-1');
    expect(database.prepare('SELECT count(*) count FROM sleep_events WHERE child_id = ?;')
      .get('child-1')).toEqual({ count: 0 });
  });
});
