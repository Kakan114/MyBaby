import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { createAppRuntime } from '../../../runtime/app-runtime';
import { SqliteActiveChildRepository } from '../../children/data/sqlite-active-child-repository';
import { SqliteChildRepository } from '../../children/data/sqlite-child-repository';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { SqliteBreastfeedingTimerRepository } from '../../feeding/data/sqlite-breastfeeding-timer-repository';
import { SqliteFeedingRepository } from '../../feeding/data/sqlite-feeding-repository';
import { SqliteGrowthRepository } from '../../growth/data/sqlite-growth-repository';
import { SqliteMilestoneRepository } from '../../milestones/data/sqlite-milestone-repository';
import { SqliteDiaperRepository } from '../../diapers/data/sqlite-diaper-repository';
import { SqliteSleepRepository } from '../../sleep/data/sqlite-sleep-repository';
import { getLocalDayContext } from '../../today/data/local-day-context';
import { SqliteReminderRepository } from '../data/sqlite-reminder-repository';

const now = Date.parse('2026-10-10T12:00:00Z');

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
      return { changes: Number((database.prepare(sql).run(...bindings(params)) as { changes: number | bigint }).changes) };
    },
  };
}

function composition(database: DatabaseSync) {
  const connection = { ...adapter(database), closeAsync: vi.fn(async () => undefined) };
  const repository = new SqliteReminderRepository(connection);
  const createReminderRepository = vi.fn(() => repository);
  let id = 0;
  const runtime = createAppRuntime({
    openDatabase: async () => connection,
    createChildRepository: (db) => new SqliteChildRepository(db),
    createActiveChildRepository: (db) => new SqliteActiveChildRepository(db),
    createFeedingRepository: (db) => new SqliteFeedingRepository(db),
    createBreastfeedingTimerRepository: (db) => new SqliteBreastfeedingTimerRepository(db),
    createSleepRepository: (db) => new SqliteSleepRepository(db),
    createDiaperRepository: (db) => new SqliteDiaperRepository(db),
    createGrowthRepository: (db) => new SqliteGrowthRepository(db),
    createMilestoneRepository: (db) => new SqliteMilestoneRepository(db),
    createReminderRepository,
    createTodayReadRepositories: (db) => ({
      feeding: new SqliteFeedingRepository(db),
      sleep: new SqliteSleepRepository(db),
      diapers: new SqliteDiaperRepository(db),
    }),
    childIdGenerator: { generate: () => `child-${++id}` },
    feedingIdGenerator: { generate: () => `feeding-${++id}` },
    sleepIdGenerator: { generate: () => `sleep-${++id}` },
    diaperIdGenerator: { generate: () => `diaper-${++id}` },
    growthIdGenerator: { generate: () => `growth-${++id}` },
    milestoneIdGenerator: { generate: () => `milestone-${++id}` },
    reminderIdGenerator: { generate: () => `reminder-${++id}` },
    getCurrentCalendarDate: () => createCalendarDate('2026-10-10'),
    getCurrentEpochMs: () => now,
    getLocalDayContext,
  });
  return { runtime, repository, connection, createReminderRepository };
}

async function fixture() {
  const database = await createMigratedTestDatabase();
  database.exec(`
    INSERT INTO children VALUES ('a', 'Child A', '2026-01-01'), ('b', 'Child B', '2026-01-01');
    INSERT INTO active_child_selection VALUES (1, 'a');
  `);
  return { database, ...composition(database) };
}

describe('Reminders through shared AppRuntime and encrypted-schema SQLite boundary', () => {
  it('creates, reads, pages, updates, deletes and isolates active children', async () => {
    const f = await fixture();
    try {
      const initial = await f.runtime.reminders.getList();
      const first = (await f.runtime.reminders.record(initial.context, {
        title: 'Senare', scheduledAtEpochMs: now + 120_000,
      })).value;
      const second = (await f.runtime.reminders.record(initial.context, {
        title: 'Tidigare', scheduledAtEpochMs: now + 60_000,
      })).value;
      const page = await f.runtime.reminders.getList(initial.context, 1);
      expect(page.value.items).toEqual([second]);
      expect((await f.runtime.reminders.getList(
        initial.context, 1, page.value.nextCursor,
      )).value.items).toEqual([first]);
      expect((await f.runtime.reminders.getById(initial.context, first.id)).value).toEqual(first);

      f.database.prepare('INSERT INTO reminders VALUES (?, ?, ?, ?, ?)')
        .run('expired', 'a', 'Passerad', now, 1);
      await expect(f.runtime.reminders.getUpcoming()).resolves.toMatchObject({
        value: { items: [second, first] },
      });
      await expect(f.runtime.reminders.getPast()).resolves.toMatchObject({
        value: { items: [{ id: 'expired' }] },
      });

      const updated = (await f.runtime.reminders.update(initial.context, first, {
        title: 'Uppdaterad', scheduledAtEpochMs: now + 180_000,
      })).value;
      expect(updated.revision).toBe(2);
      await expect(f.runtime.reminders.update(initial.context, first, {
        title: 'Stale', scheduledAtEpochMs: now + 1,
      })).rejects.toMatchObject({ code: 'revision-conflict' });

      await f.runtime.children.setActiveChild('b');
      const b = await f.runtime.reminders.getList();
      expect(b.value.items).toEqual([]);
      await expect(f.runtime.reminders.record(initial.context, {
        title: 'Fel barn', scheduledAtEpochMs: now + 1,
      })).rejects.toMatchObject({ code: 'stale-child-context' });

      await f.runtime.children.setActiveChild('a');
      const a = await f.runtime.reminders.getList();
      await f.runtime.reminders.delete(a.context, updated);
      expect((await f.runtime.reminders.getById(a.context, updated.id)).value).toBeNull();
      expect((await f.runtime.reminders.getList(a.context)).value.items).toEqual([
        expect.objectContaining({ id: 'expired' }),
        second,
      ]);
      expect(f.createReminderRepository).toHaveBeenCalledOnce();
      expect(f.createReminderRepository).toHaveBeenCalledWith(f.connection);
    } finally {
      await f.runtime.close();
      f.database.close();
    }
  });

  it('keeps expired reminders readable and drains accepted work before closing once', async () => {
    const f = await fixture();
    try {
      f.database.prepare(
        'INSERT INTO reminders VALUES (?, ?, ?, ?, ?)',
      ).run('expired', 'a', 'Redan passerad', now - 1, 1);
      const started = Promise.withResolvers<void>();
      const finish = Promise.withResolvers<void>();
      const original = f.repository.listPastByChild.bind(f.repository);
      vi.spyOn(f.repository, 'listPastByChild').mockImplementationOnce(async (...args) => {
        started.resolve();
        await finish.promise;
        return original(...args);
      });
      const read = f.runtime.reminders.getPast();
      await started.promise;
      const close = f.runtime.close();
      expect(f.runtime.close()).toBe(close);
      await expect(f.runtime.reminders.getPast()).rejects.toMatchObject({ code: 'runtime-closed' });
      expect(f.connection.closeAsync).not.toHaveBeenCalled();
      finish.resolve();
      expect((await read).value.items[0]).toMatchObject({ id: 'expired' });
      await close;
      expect(f.connection.closeAsync).toHaveBeenCalledOnce();
    } finally {
      await f.runtime.close();
      f.database.close();
    }
  });
});
