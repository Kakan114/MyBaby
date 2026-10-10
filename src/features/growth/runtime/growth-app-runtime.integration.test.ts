import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { migrateLocalDatabase } from '../../../data/local/migrations';
import { createAppRuntime } from '../../../runtime/app-runtime';
import { SqliteChildRepository } from '../../children/data/sqlite-child-repository';
import { SqliteActiveChildRepository } from '../../children/data/sqlite-active-child-repository';
import { SqliteFeedingRepository } from '../../feeding/data/sqlite-feeding-repository';
import { SqliteBreastfeedingTimerRepository } from '../../feeding/data/sqlite-breastfeeding-timer-repository';
import { SqliteSleepRepository } from '../../sleep/data/sqlite-sleep-repository';
import { SqliteDiaperRepository } from '../../diapers/data/sqlite-diaper-repository';
import { SqliteGrowthRepository } from '../data/sqlite-growth-repository';
import { SqliteMilestoneRepository } from '../../milestones/data/sqlite-milestone-repository';
import { getLocalDayContext } from '../../today/data/local-day-context';
import { createCalendarDate } from '../../children/domain/calendar-date';

const date = createCalendarDate('2026-10-08');
const values = { measuredOn: date, weightGrams: 4567, lengthMm: null, headCircumferenceMm: null, lengthMethod: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function bindings(params: unknown[]): (string | number | bigint | Uint8Array | null)[] {
  return params.map(value => {
    if (typeof value === 'boolean') return Number(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'bigint' || value instanceof Uint8Array) return value;
    throw new Error('Unsupported test binding');
  });
}
function adapter(db: DatabaseSync) {
  return {
    async execAsync(sql: string) { db.exec(sql); },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (db.prepare(sql).get(...bindings(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params: unknown[]) {
      return db.prepare(sql).all(...bindings(params)) as T[];
    },
    async runAsync(sql: string, params: unknown[]) {
      return { changes: Number((db.prepare(sql).run(...bindings(params)) as { changes: number | bigint }).changes) };
    },
  };
}
function composition(db: DatabaseSync, closeConnection: () => Promise<void> = async () => {}) {
  const connection = { ...adapter(db), closeAsync: vi.fn(closeConnection) };
  const repository = new SqliteGrowthRepository(connection);
  const activeChildren = new SqliteActiveChildRepository(connection);
  const readers = {
    feeding: new SqliteFeedingRepository(connection),
    sleep: new SqliteSleepRepository(connection),
    diapers: new SqliteDiaperRepository(connection),
  };
  let id = 0;
  const createGrowthRepository = vi.fn(() => repository);
  const runtime = createAppRuntime({
    openDatabase: async () => connection,
    createChildRepository: database => new SqliteChildRepository(database),
    createActiveChildRepository: () => activeChildren,
    createFeedingRepository: database => new SqliteFeedingRepository(database),
    createBreastfeedingTimerRepository: database => new SqliteBreastfeedingTimerRepository(database),
    createSleepRepository: database => new SqliteSleepRepository(database),
    createDiaperRepository: database => new SqliteDiaperRepository(database),
    createGrowthRepository,
    createMilestoneRepository: database => new SqliteMilestoneRepository(database),
    createTodayReadRepositories: () => readers,
    getCurrentCalendarDate: () => date,
    getCurrentEpochMs: () => Date.parse('2026-10-08T12:00:00Z'),
    getLocalDayContext,
    growthIdGenerator: { generate: () => 'growth-' + ++id },
    milestoneIdGenerator: { generate: () => 'milestone-' + ++id },
    childIdGenerator: { generate: () => 'child-' + ++id },
    feedingIdGenerator: { generate: () => 'feeding-' + ++id },
    sleepIdGenerator: { generate: () => 'sleep-' + ++id },
    diaperIdGenerator: { generate: () => 'diaper-' + ++id },
  });
  return { runtime, repository, connection, readers, createGrowthRepository, activeChildren };
}
async function fixture() {
  const db = await createMigratedTestDatabase();
  db.exec("INSERT INTO children VALUES ('a','Child A','2026-01-01'),('b','Child B','2026-01-01'); INSERT INTO active_child_selection VALUES (1,'a');");
  return { db, ...composition(db) };
}

describe('Growth through the shared AppRuntime and real SQLite', () => {
  it('creates same-day records, reads, pages, edits and deletes without affecting another child', async () => {
    const f = await fixture();
    try {
      const { context } = await f.runtime.growth.getHistory();
      const first = (await f.runtime.growth.record(context, values)).value;
      const second = (await f.runtime.growth.record(context, { ...values, weightGrams: 5000 })).value;
      const page = await f.runtime.growth.getHistory(context, 1);
      expect(page.value.items.map(item => item.id)).toEqual([second.id]);
      expect((await f.runtime.growth.getHistory(context, 1, page.value.nextCursor)).value.items).toEqual([first]);
      expect((await f.runtime.growth.getById(context, first.id)).value).toEqual(first);
      const updated = (await f.runtime.growth.update(context, first, { ...values, weightGrams: 6000 })).value;
      expect(updated.revision).toBe(2);
      await expect(f.runtime.growth.update(context, first, values)).rejects.toMatchObject({ code: 'revision-conflict' });
      await expect(f.runtime.growth.delete(context, first)).rejects.toMatchObject({ code: 'revision-conflict' });
      await f.runtime.children.setActiveChild('b');
      const b = await f.runtime.growth.getHistory();
      expect(b.value.items).toEqual([]);
      expect((await f.runtime.growth.getById(b.context, first.id)).value).toBeNull();
      await expect(f.runtime.growth.record(context, values)).rejects.toMatchObject({ code: 'stale-child-context' });
      await expect(f.runtime.growth.delete(b.context, updated)).rejects.toMatchObject({ code: 'stale-child-context' });
      await f.runtime.children.setActiveChild('a');
      const a = await f.runtime.growth.getHistory();
      await f.runtime.growth.delete(a.context, updated);
      expect((await f.runtime.growth.getById(a.context, first.id)).value).toBeNull();
      expect((await f.runtime.growth.getHistory(a.context)).value.items).toEqual([second]);
      expect(f.createGrowthRepository).toHaveBeenCalledTimes(1);
      expect(f.createGrowthRepository).toHaveBeenCalledWith(f.connection);
    } finally { await f.runtime.close(); f.db.close(); }
  });
  it('keeps reconciliation inside the queue and drains it before closing exactly once', async () => {
    const f = await fixture();
    try {
      const { context } = await f.runtime.growth.getHistory();
      const originalCreate = f.repository.create.bind(f.repository);
      const write = vi.spyOn(f.repository, 'create');
      write.mockImplementation(async measurement => { await originalCreate(measurement); throw new Error('ambiguous native return'); });
      const started = deferred<void>(); const finish = deferred<void>();
      const originalRead = f.repository.getById.bind(f.repository);
      vi.spyOn(f.repository, 'getById').mockImplementation(async (childId, id) => {
        started.resolve(); await finish.promise; return originalRead(childId, id);
      });
      const todayRead = vi.spyOn(f.readers.feeding, 'getCompletedSummary');
      const save = f.runtime.growth.record(context, values);
      await started.promise;
      const queued = f.runtime.today.getSummary();
      // Let the accepted Today operation initialize before shutdown.
      await Promise.resolve(); await Promise.resolve();
      const close = f.runtime.close();
      expect(f.runtime.close()).toBe(close);
      await expect(f.runtime.growth.getHistory()).rejects.toMatchObject({ code: 'runtime-closed' });
      expect(todayRead).not.toHaveBeenCalled();
      expect(f.connection.closeAsync).not.toHaveBeenCalled();
      finish.resolve();
      expect((await save).value.id).toBe('growth-1');
      expect((await queued).status).toBe('ready');
      await close;
      expect(write).toHaveBeenCalledTimes(1);
      expect(todayRead).toHaveBeenCalledTimes(1);
      expect(f.connection.closeAsync).toHaveBeenCalledTimes(1);
      expect(f.db.prepare('SELECT COUNT(*) AS count FROM growth_measurements').get()).toEqual({ count: 1 });
    } finally { await f.runtime.close(); f.db.close(); }
  });
  it('releases the shared queue after reconciliation fails, without another write', async () => {
    const f = await fixture();
    try {
      const { context } = await f.runtime.growth.getHistory();
      const create = vi.spyOn(f.repository, 'create').mockRejectedValue(new Error('busy'));
      vi.spyOn(f.repository, 'getById').mockRejectedValue(new Error('unavailable'));
      await expect(f.runtime.growth.record(context, values)).rejects.toMatchObject({
        code: 'mutation-outcome-uncertain', pendingMeasurement: { id: 'growth-1', childId: 'a' },
      });
      expect((await f.runtime.today.getSummary()).status).toBe('ready');
      expect((await f.runtime.sleep.getState()).childId).toBe('a');
      expect((await f.runtime.diapers.getState()).childId).toBe('a');
      expect((await f.runtime.feeding.getRecentFeedings()).childId).toBe('a');
      expect(create).toHaveBeenCalledTimes(1);
    } finally { await f.runtime.close(); f.db.close(); }
  });
  it('publishes neutral switch notifications and rejects a pending old-child mutation before writing', async () => {
    const f = await fixture();
    try {
      const context = (await f.runtime.growth.getHistory()).context;
      const listener = vi.fn();
      const unsubscribe = f.runtime.activeChildSelection.subscribe(listener);
      const badListener = f.runtime.activeChildSelection.subscribe(() => { throw new Error('subscriber'); });
      const measurement = (await f.runtime.growth.record(context, values)).value;
      const started = deferred<void>(); const finish = deferred<void>();
      const originalRead = f.repository.getById.bind(f.repository);
      vi.spyOn(f.repository, 'getById').mockImplementationOnce(async (childId, id) => {
        started.resolve(); await finish.promise; return originalRead(childId, id);
      });
      const update = vi.spyOn(f.repository, 'updateIfMatches');
      const pending = f.runtime.growth.update(context, measurement, { ...values, weightGrams: 6000 });
      const checked = expect(pending).rejects.toMatchObject({ code: 'stale-child-context' });
      await started.promise;
      const switching = f.runtime.children.setActiveChild('b');
      expect(listener).toHaveBeenLastCalledWith(true);
      finish.resolve(); await checked; await switching;
      expect(update).not.toHaveBeenCalled();
      expect(listener.mock.calls).toEqual([[true], [false]]);
      expect((await f.runtime.growth.getHistory()).context.childId).toBe('b');
      expect(await originalRead('a', measurement.id)).toEqual(measurement);
      unsubscribe(); badListener();
      await f.runtime.children.setActiveChild('a');
      expect(listener).toHaveBeenCalledTimes(2);
    } finally { await f.runtime.close(); f.db.close(); }
  });
  it('rejects a read made during selection intent even when the switch is queued behind it', async () => {
    const f = await fixture();
    try {
      const context = (await f.runtime.growth.getHistory()).context;
      const started = deferred<void>(); const finish = deferred<void>();
      const originalHistory = f.repository.listHistory.bind(f.repository);
      vi.spyOn(f.repository, 'listHistory').mockImplementationOnce(async (...args) => {
        started.resolve(); await finish.promise; return originalHistory(...args);
      });
      const history = f.runtime.growth.getHistory(context);
      const checked = expect(history).rejects.toMatchObject({ code: 'stale-child-context' });
      await started.promise;
      const switching = f.runtime.children.setActiveChild('b');
      const duringSwitch = f.runtime.growth.getHistory();
      const duringCheck = expect(duringSwitch).rejects.toMatchObject({ code: 'stale-child-context' });
      finish.resolve(); await checked; await switching; await duringCheck;
      expect((await f.runtime.growth.getHistory()).child.id).toBe('b');
    } finally { await f.runtime.close(); f.db.close(); }
  });
  it('preserves records across closed connections and runtime recreation, and rejects the old context', async () => {
    const directory = resolve(mkdtempSync(join(tmpdir(), 'mybaby-growth-runtime-')));
    const filename = resolve(join(directory, 'runtime-test.db'));
    if (!directory.startsWith(resolve(tmpdir()) + '/') && !directory.startsWith(resolve(tmpdir()) + String.fromCharCode(92))) {
      throw new Error('Test directory escaped temporary root');
    }
    let db: DatabaseSync | null = new DatabaseSync(filename);
    let runtime: ReturnType<typeof createAppRuntime> | null = null;
    try {
      db.exec('PRAGMA foreign_keys = ON;');
      await migrateLocalDatabase(adapter(db));
      db.exec("INSERT INTO children VALUES ('a','Child','2026-01-01'); INSERT INTO active_child_selection VALUES (1,'a');");
      const firstDatabase = db;
      const first = composition(firstDatabase, async () => firstDatabase.close());
      runtime = first.runtime;
      const context = (await runtime.growth.getHistory()).context;
      const saved = (await runtime.growth.record(context, values)).value;
      await runtime.close(); runtime = null; db = null;
      const replacementDatabase = new DatabaseSync(filename);
      db = replacementDatabase;
      replacementDatabase.exec('PRAGMA foreign_keys = ON;');
      await migrateLocalDatabase(adapter(replacementDatabase));
      const replacement = composition(replacementDatabase, async () => replacementDatabase.close());
      runtime = replacement.runtime;
      const history = await runtime.growth.getHistory();
      expect(history.value.items).toEqual([saved]);
      expect((await runtime.growth.getById(history.context, saved.id)).value).toEqual(saved);
      await expect(runtime.growth.record(context, values)).rejects.toMatchObject({ code: 'stale-child-context' });
      await runtime.close(); runtime = null; db = null;
    } finally {
      if (runtime !== null) { await runtime.close(); db = null; }
      if (db !== null) db.close();
      rmSync(filename); rmdirSync(directory);
    }
  });
});
