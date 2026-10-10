import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { migrateLocalDatabase } from '../../../data/local/migrations';
import { createAppRuntime } from '../../../runtime/app-runtime';
import { SqliteActiveChildRepository } from '../../children/data/sqlite-active-child-repository';
import { SqliteChildRepository } from '../../children/data/sqlite-child-repository';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { SqliteBreastfeedingTimerRepository } from '../../feeding/data/sqlite-breastfeeding-timer-repository';
import { SqliteFeedingRepository } from '../../feeding/data/sqlite-feeding-repository';
import { SqliteGrowthRepository } from '../../growth/data/sqlite-growth-repository';
import { SqliteDiaperRepository } from '../../diapers/data/sqlite-diaper-repository';
import { SqliteSleepRepository } from '../../sleep/data/sqlite-sleep-repository';
import { getLocalDayContext } from '../../today/data/local-day-context';
import { SqliteMilestoneRepository } from '../data/sqlite-milestone-repository';

const today = createCalendarDate('2026-10-08');
const values = {
  subject: { kind: 'predefined', definitionId: 'social.first-smile' } as const,
  occurredOn: createCalendarDate('2026-03-01'),
  note: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function bindings(params: unknown[]): (string | number | bigint | Uint8Array | null)[] {
  return params.map((value) => {
    if (typeof value === 'boolean') return Number(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (
      value === null || typeof value === 'string' || typeof value === 'number' ||
      typeof value === 'bigint' || value instanceof Uint8Array
    ) return value;
    throw new Error('Unsupported test binding');
  });
}

function adapter(database: DatabaseSync) {
  return {
    async execAsync(sql: string) { database.exec(sql); },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      return (database.prepare(sql).get(...bindings(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params: unknown[]) {
      return database.prepare(sql).all(...bindings(params)) as T[];
    },
    async runAsync(sql: string, params: unknown[]) {
      return {
        changes: Number((database.prepare(sql).run(...bindings(params)) as {
          changes: number | bigint;
        }).changes),
      };
    },
  };
}

function composition(
  database: DatabaseSync,
  closeConnection: () => Promise<void> = async () => {},
) {
  const connection = { ...adapter(database), closeAsync: vi.fn(closeConnection) };
  const repository = new SqliteMilestoneRepository(connection);
  const activeChildren = new SqliteActiveChildRepository(connection);
  const readers = {
    feeding: new SqliteFeedingRepository(connection),
    sleep: new SqliteSleepRepository(connection),
    diapers: new SqliteDiaperRepository(connection),
  };
  let milestoneId = 0;
  const createMilestoneRepository = vi.fn(() => repository);
  const runtime = createAppRuntime({
    openDatabase: async () => connection,
    createChildRepository: (db) => new SqliteChildRepository(db),
    createActiveChildRepository: () => activeChildren,
    createFeedingRepository: (db) => new SqliteFeedingRepository(db),
    createBreastfeedingTimerRepository: (db) => new SqliteBreastfeedingTimerRepository(db),
    createSleepRepository: (db) => new SqliteSleepRepository(db),
    createDiaperRepository: (db) => new SqliteDiaperRepository(db),
    createGrowthRepository: (db) => new SqliteGrowthRepository(db),
    createMilestoneRepository,
    createTodayReadRepositories: () => readers,
    getCurrentCalendarDate: () => today,
    getCurrentEpochMs: () => Date.parse('2026-10-08T12:00:00Z'),
    getLocalDayContext,
    milestoneIdGenerator: { generate: () => `milestone-${++milestoneId}` },
    growthIdGenerator: { generate: () => 'growth-id' },
    childIdGenerator: { generate: () => 'child-id' },
    feedingIdGenerator: { generate: () => 'feeding-id' },
    sleepIdGenerator: { generate: () => 'sleep-id' },
    diaperIdGenerator: { generate: () => 'diaper-id' },
  });
  return {
    runtime, repository, connection, readers, createMilestoneRepository, activeChildren,
  };
}

async function fixture() {
  const database = await createMigratedTestDatabase();
  database.exec(`
    INSERT INTO children VALUES
      ('a', 'Child A', '2026-01-01'),
      ('b', 'Child B', '2026-01-01');
    INSERT INTO active_child_selection VALUES (1, 'a');
  `);
  return { database, ...composition(database) };
}

describe('Milestones through shared AppRuntime and real schema-v8 SQLite', () => {
  it('creates, reads, pages, updates, deletes, and isolates children', async () => {
    const f = await fixture();
    try {
      const initial = await f.runtime.milestones.getHistory();
      const first = (await f.runtime.milestones.record(initial.context, values)).value;
      const second = (await f.runtime.milestones.record(initial.context, {
        ...values, subject: { kind: 'custom', title: 'Egen milstolpe' }, note: 'Anteckning',
      })).value;
      const page = await f.runtime.milestones.getHistory(initial.context, 1);
      expect(page.value.items).toEqual([second]);
      expect((await f.runtime.milestones.getHistory(
        initial.context, 1, page.value.nextCursor,
      )).value.items).toEqual([first]);
      expect((await f.runtime.milestones.getById(initial.context, first.id)).value)
        .toEqual(first);

      const updated = (await f.runtime.milestones.update(initial.context, first, {
        ...values, note: 'Uppdaterad',
      })).value;
      expect(updated.revision).toBe(2);
      await expect(f.runtime.milestones.update(initial.context, first, values))
        .rejects.toMatchObject({ code: 'revision-conflict' });

      await f.runtime.children.setActiveChild('b');
      const childB = await f.runtime.milestones.getHistory();
      expect(childB.value.items).toEqual([]);
      expect((await f.runtime.milestones.getById(childB.context, first.id)).value).toBeNull();
      await expect(f.runtime.milestones.record(initial.context, values))
        .rejects.toMatchObject({ code: 'stale-child-context' });
      await expect(f.runtime.milestones.delete(childB.context, updated))
        .rejects.toMatchObject({ code: 'stale-child-context' });

      await f.runtime.children.setActiveChild('a');
      const returnedA = await f.runtime.milestones.getHistory();
      await expect(f.runtime.milestones.getHistory(initial.context))
        .rejects.toMatchObject({ code: 'stale-child-context' });
      await f.runtime.milestones.delete(returnedA.context, updated);
      expect((await f.runtime.milestones.getHistory(returnedA.context)).value.items)
        .toEqual([second]);
      expect(f.createMilestoneRepository).toHaveBeenCalledOnce();
      expect(f.createMilestoneRepository).toHaveBeenCalledWith(f.connection);
      expect(f.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 });
    } finally { await f.runtime.close(); f.database.close(); }
  });

  it('invalidates old A contexts and pagination after A to B to A', async () => {
    const f = await fixture();
    try {
      const oldA = await f.runtime.milestones.getHistory();
      await f.runtime.milestones.record(oldA.context, values);
      await f.runtime.milestones.record(oldA.context, {
        ...values, subject: { kind: 'predefined', definitionId: 'motor.rolls-over' },
      });
      const firstPage = await f.runtime.milestones.getHistory(oldA.context, 1);
      await f.runtime.children.setActiveChild('b');
      await f.runtime.children.setActiveChild('a');
      await expect(f.runtime.milestones.getHistory(oldA.context))
        .rejects.toMatchObject({ code: 'stale-child-context' });
      await expect(f.runtime.milestones.getHistory(
        oldA.context, 1, firstPage.value.nextCursor,
      )).rejects.toMatchObject({ code: 'stale-child-context' });
      const currentA = await f.runtime.milestones.getHistory();
      expect(currentA.value.items).toHaveLength(2);
      expect(currentA.context.selectionVersion).not.toBe(oldA.context.selectionVersion);
    } finally { await f.runtime.close(); f.database.close(); }
  });

  it('prevents a queued child switch from allowing an in-flight stale mutation to write', async () => {
    const f = await fixture();
    try {
      const context = (await f.runtime.milestones.getHistory()).context;
      const entry = (await f.runtime.milestones.record(context, values)).value;
      const started = deferred<void>();
      const finish = deferred<void>();
      const originalRead = f.repository.getById.bind(f.repository);
      vi.spyOn(f.repository, 'getById').mockImplementationOnce(async (childId, id) => {
        started.resolve();
        await finish.promise;
        return originalRead(childId, id);
      });
      const update = vi.spyOn(f.repository, 'updateIfMatches');
      const pending = f.runtime.milestones.update(context, entry, {
        ...values, note: 'Must not be written',
      });
      const rejected = expect(pending).rejects.toMatchObject({ code: 'stale-child-context' });
      await started.promise;
      const switching = f.runtime.children.setActiveChild('b');
      finish.resolve();
      await rejected;
      await switching;
      expect(update).not.toHaveBeenCalled();
      expect(await originalRead('a', entry.id)).toEqual(entry);
    } finally { await f.runtime.close(); f.database.close(); }
  });

  it('revalidates a child context before a queued operation starts and performs no stale write', async () => {
    const f = await fixture();
    try {
      const context = (await f.runtime.milestones.getHistory()).context;
      const blockerStarted = deferred<void>();
      const releaseBlocker = deferred<void>();
      const originalSummary = f.readers.feeding.getCompletedSummary.bind(f.readers.feeding);
      vi.spyOn(f.readers.feeding, 'getCompletedSummary').mockImplementationOnce(async (...args) => {
        blockerStarted.resolve();
        await releaseBlocker.promise;
        return originalSummary(...args);
      });
      const blocker = f.runtime.today.getSummary();
      await blockerStarted.promise;
      const create = vi.spyOn(f.repository, 'create');
      const queued = f.runtime.milestones.record(context, values);
      const rejected = expect(queued).rejects.toMatchObject({ code: 'stale-child-context' });
      const switching = f.runtime.children.setActiveChild('b');
      releaseBlocker.resolve();
      await blocker;
      await rejected;
      await switching;
      expect(create).not.toHaveBeenCalled();
      expect((await f.runtime.milestones.getHistory()).context.childId).toBe('b');
    } finally { await f.runtime.close(); f.database.close(); }
  });

  it('rejects an old history completion after selection changes without publishing its value', async () => {
    const f = await fixture();
    try {
      const context = (await f.runtime.milestones.getHistory()).context;
      const started = deferred<void>();
      const finish = deferred<void>();
      const originalHistory = f.repository.listHistory.bind(f.repository);
      vi.spyOn(f.repository, 'listHistory').mockImplementationOnce(async (...args) => {
        started.resolve();
        await finish.promise;
        return originalHistory(...args);
      });
      const pending = f.runtime.milestones.getHistory(context);
      const rejected = expect(pending).rejects.toMatchObject({ code: 'stale-child-context' });
      await started.promise;
      const switching = f.runtime.children.setActiveChild('b');
      finish.resolve();
      await rejected;
      await switching;
      expect((await f.runtime.milestones.getHistory()).context.childId).toBe('b');
    } finally { await f.runtime.close(); f.database.close(); }
  });

  it('keeps ambiguous reconciliation in the queue, drains shutdown, and never repeats the write', async () => {
    const f = await fixture();
    try {
      const context = (await f.runtime.milestones.getHistory()).context;
      const originalCreate = f.repository.create.bind(f.repository);
      const create = vi.spyOn(f.repository, 'create');
      create.mockImplementation(async (entry) => {
        await originalCreate(entry);
        throw new Error('ambiguous native return');
      });
      const started = deferred<void>();
      const finish = deferred<void>();
      const originalRead = f.repository.getById.bind(f.repository);
      vi.spyOn(f.repository, 'getById').mockImplementation(async (childId, id) => {
        started.resolve();
        await finish.promise;
        return originalRead(childId, id);
      });
      const save = f.runtime.milestones.record(context, values);
      await started.promise;
      const queued = f.runtime.today.getSummary();
      await Promise.resolve();
      await Promise.resolve();
      const close = f.runtime.close();
      expect(f.runtime.close()).toBe(close);
      await expect(f.runtime.milestones.getHistory())
        .rejects.toMatchObject({ code: 'runtime-closed' });
      expect(f.connection.closeAsync).not.toHaveBeenCalled();
      finish.resolve();
      expect((await save).value.id).toBe('milestone-1');
      expect((await queued).status).toBe('ready');
      await close;
      expect(create).toHaveBeenCalledOnce();
      expect(f.connection.closeAsync).toHaveBeenCalledOnce();
      expect(f.database.prepare('SELECT COUNT(*) AS count FROM milestone_entries').get())
        .toEqual({ count: 1 });
    } finally { await f.runtime.close(); f.database.close(); }
  });

  it('persists across runtime recreation and rejects the previous runtime scope', async () => {
    const directory = resolve(mkdtempSync(join(tmpdir(), 'mybaby-milestone-runtime-')));
    const filename = resolve(join(directory, 'runtime-test.db'));
    if (!directory.startsWith(resolve(tmpdir()) + '/') && !directory.startsWith(resolve(tmpdir()) + '\\')) {
      throw new Error('Test directory escaped temporary root');
    }
    let database: DatabaseSync | null = new DatabaseSync(filename);
    let runtime: ReturnType<typeof createAppRuntime> | null = null;
    try {
      database.exec('PRAGMA foreign_keys = ON;');
      await migrateLocalDatabase(adapter(database));
      database.exec(`
        INSERT INTO children VALUES ('a', 'Child', '2026-01-01');
        INSERT INTO active_child_selection VALUES (1, 'a');
      `);
      const firstDatabase = database;
      const first = composition(firstDatabase, async () => firstDatabase.close());
      runtime = first.runtime;
      const context = (await runtime.milestones.getHistory()).context;
      const saved = (await runtime.milestones.record(context, values)).value;
      await runtime.close();
      runtime = null;
      database = null;

      const replacementDatabase = new DatabaseSync(filename);
      database = replacementDatabase;
      replacementDatabase.exec('PRAGMA foreign_keys = ON;');
      await migrateLocalDatabase(adapter(replacementDatabase));
      const replacement = composition(replacementDatabase, async () => replacementDatabase.close());
      runtime = replacement.runtime;
      const history = await runtime.milestones.getHistory();
      expect(history.value.items).toEqual([saved]);
      await expect(runtime.milestones.getHistory(context))
        .rejects.toMatchObject({ code: 'stale-child-context' });
    } finally {
      if (runtime !== null) {
        await runtime.close();
        database = null;
      } else {
        database?.close();
      }
      rmSync(filename);
      rmdirSync(directory);
    }
  });
});
