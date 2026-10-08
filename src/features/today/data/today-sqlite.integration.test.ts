import { SqliteGrowthRepository } from '../../growth/data/sqlite-growth-repository';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { SqliteChildRepository } from '../../children/data/sqlite-child-repository';
import { SqliteActiveChildRepository } from '../../children/data/sqlite-active-child-repository';
import { SqliteFeedingRepository } from '../../feeding/data/sqlite-feeding-repository';
import { SqliteBreastfeedingTimerRepository } from '../../feeding/data/sqlite-breastfeeding-timer-repository';
import { SqliteSleepRepository } from '../../sleep/data/sqlite-sleep-repository';
import { SqliteDiaperRepository } from '../../diapers/data/sqlite-diaper-repository';
import { createAppRuntime, AppRuntimeError, type AppRuntime } from '../../../runtime/app-runtime';
import { getLocalDayContext } from './local-day-context';
import type { TodayReadRepositories } from '../application/get-today-summary';
import { createCalendarDate } from '../../children/domain/calendar-date';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function adapter(db: DatabaseSync) {
  return {
    async execAsync(sql: string) { db.exec(sql); },
    async getAllAsync<T>(sql: string, params: any[]) { return db.prepare(sql).all(...params) as T[]; },
    async getFirstAsync<T>(sql: string, params: any[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async runAsync(sql: string, params: any[]) {
      const result = db.prepare(sql).run(...params) as { changes: number | bigint };
      return { changes: Number(result.changes) };
    },
    async closeAsync() { db.close(); },
  };
}
const dayStart = Date.parse('2026-10-07T00:00:00Z');
const dayEnd = Date.parse('2026-10-08T00:00:00Z');
let now = dayStart + 12 * 3_600_000;
let previousZone: string | undefined;
let db: DatabaseSync;
let runtime: AppRuntime;
let readers: TodayReadRepositories;
let closeSpy: ReturnType<typeof vi.fn<() => Promise<void>>>;

function feeding(id: string, childId: string, time: number) {
  db.prepare(`INSERT INTO feeding_events
    (id, child_id, occurred_at_epoch_ms, kind, amount_tenths_ml, contents)
    VALUES (?, ?, ?, 'bottle', 100, 'formula')`).run(id, childId, time);
}
function diaper(id: string, childId: string, time: number) {
  db.prepare("INSERT INTO diaper_events VALUES (?, ?, ?, 'wet')").run(id, childId, time);
}
function sleep(id: string, childId: string, start: number, end: number) {
  db.prepare('INSERT INTO sleep_events VALUES (?, ?, ?, ?)').run(id, childId, start, end);
}

beforeEach(async () => {
  previousZone = process.env.TZ;
  process.env.TZ = 'UTC';
  now = dayStart + 12 * 3_600_000;
  db = await createMigratedTestDatabase();
  for (const id of ['a', 'b']) db.prepare('INSERT INTO children VALUES (?, ?, ?)')
    .run(id, id === 'a' ? 'Mio' : 'Kim', '2026-10-06');
  db.exec("INSERT INTO active_child_selection VALUES (1, 'a');");
  const database = adapter(db);
  closeSpy = vi.fn(database.closeAsync);
  let generated = 0;
  runtime = createAppRuntime({
    openDatabase: async () => ({ ...database, closeAsync: closeSpy }),
    createActiveChildRepository: (connection) => new SqliteActiveChildRepository(connection),
    createChildRepository: (connection) => new SqliteChildRepository(connection),
    createFeedingRepository: (connection) => new SqliteFeedingRepository(connection),
    createBreastfeedingTimerRepository: (connection) => new SqliteBreastfeedingTimerRepository(connection),
    createSleepRepository: (connection) => new SqliteSleepRepository(connection),
    createGrowthRepository: (connection) => new SqliteGrowthRepository(connection),
    createDiaperRepository: (connection) => new SqliteDiaperRepository(connection),
    createTodayReadRepositories(connection) {
      readers = {
        feeding: new SqliteFeedingRepository(connection),
        diapers: new SqliteDiaperRepository(connection),
        sleep: new SqliteSleepRepository(connection),
      };
      return readers;
    },
    getLocalDayContext,
    getCurrentEpochMs: () => now,
    getCurrentCalendarDate: () => createCalendarDate('2026-10-07'),
    childIdGenerator: { generate: () => 'new-child' },
    feedingIdGenerator: { generate: () => 'feeding-' + ++generated },
    sleepIdGenerator: { generate: () => 'sleep-' + ++generated },
    growthIdGenerator: { generate: () => 'generated-growth-id' },
    diaperIdGenerator: { generate: () => 'diaper-' + ++generated },
  });
});
afterEach(async () => {
  await runtime.close();
  if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone;
});
async function summary() {
  const result = await runtime.today.getSummary();
  if (result.status !== 'ready') throw new Error('Expected ready snapshot');
  return result.summary;
}

describe('Today real schema-v6 SQLite/runtime integration', () => {
  it('reads empty data without schema changes or persistent totals', async () => {
    const before = db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all();
    const result = await summary();
    expect(result.child.displayName).toBe('Mio');
    expect(result.age.fullDays).toBe(1);
    expect(result.feeding).toEqual({ dayCount: 0, latestCompletedAtEpochMs: null });
    expect(result.diapers).toEqual({ dayCount: 0, latestOccurredAtEpochMs: null });
    expect(result.sleep).toEqual({ completedDurationMs: 0, active: null });
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 });
    expect(db.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name").all()).toEqual(before);
  });

  it('counts half-open midnight boundaries and isolates every feature by child', async () => {
    for (const [id, time] of [['before', dayStart - 1], ['start', dayStart],
      ['last', dayEnd - 1], ['end', dayEnd]] as const) {
      feeding(id, 'a', time); diaper(id, 'a', time);
    }
    feeding('other', 'b', dayEnd + 1); diaper('other', 'b', dayEnd + 1);
    sleep('span', 'a', dayStart - 100, dayStart + 100);
    sleep('other-sleep', 'b', dayStart, dayEnd);
    const result = await summary();
    expect(result.feeding).toEqual({ dayCount: 2, latestCompletedAtEpochMs: dayEnd });
    expect(result.diapers).toEqual({ dayCount: 2, latestOccurredAtEpochMs: dayEnd });
    expect(result.sleep.completedDurationMs).toBe(100);
  });

  it('returns latest timestamps across all history even with zero events today', async () => {
    feeding('old', 'a', dayStart - 100); diaper('old', 'a', dayStart - 200);
    const result = await summary();
    expect(result.feeding).toEqual({ dayCount: 0, latestCompletedAtEpochMs: dayStart - 100 });
    expect(result.diapers).toEqual({ dayCount: 0, latestOccurredAtEpochMs: dayStart - 200 });
  });

  it('handles large histories and unions overlapping events beyond the latest twenty', async () => {
    const insertSleep = db.prepare('INSERT INTO sleep_events VALUES (?, ?, ?, ?)');
    db.exec('BEGIN;');
    try {
      for (let i = 0; i < 3000; i++) {
        feeding('feed-' + i, 'a', dayStart + i);
        diaper('diaper-' + i, 'a', dayStart + i);
        insertSleep.run('sleep-' + i, 'a', dayStart + i % 30 * 1000, dayStart + i % 30 * 1000 + 2000);
      }
      db.exec('COMMIT;');
    } catch (error) { db.exec('ROLLBACK;'); throw error; }
    const result = await summary();
    expect(result.feeding.dayCount).toBe(3000);
    expect(result.diapers.dayCount).toBe(3000);
    expect(result.feeding.latestCompletedAtEpochMs).toBe(dayStart + 2999);
    expect(result.sleep.completedDurationMs).toBe(31_000);
    expect(db.prepare('SELECT COUNT(*) AS count FROM sleep_events').get()).toEqual({ count: 3000 });
  });

  it('clips nested, adjacent and multi-day sleep without changing original events', async () => {
    sleep('span', 'a', dayStart - 5000, dayEnd + 5000);
    sleep('nested', 'a', dayStart + 1, dayEnd - 1);
    sleep('ends-at-start', 'a', dayStart - 10, dayStart);
    sleep('starts-at-end', 'a', dayEnd, dayEnd + 10);
    const before = db.prepare('SELECT * FROM sleep_events ORDER BY id').all();
    expect((await summary()).sleep.completedDurationMs).toBe(dayEnd - dayStart);
    expect(db.prepare('SELECT * FROM sleep_events ORDER BY id').all()).toEqual(before);
  });

  it.each([['2026-03-29T12:00:00Z', 23], ['2026-10-25T12:00:00Z', 25]] as const)(
    'uses the complete local DST day %s', async (captured, hours) => {
      process.env.TZ = 'Europe/Stockholm';
      now = Date.parse(captured);
      db.exec("UPDATE children SET date_of_birth = '2025-01-01';");
      const day = getLocalDayContext(now);
      feeding('start', 'a', day.startEpochMs);
      feeding('end', 'a', day.endEpochMs);
      diaper('last', 'a', day.endEpochMs - 1);
      sleep('long', 'a', day.startEpochMs - 1000, day.endEpochMs + 1000);
      const result = await summary();
      expect(result.day).toEqual(day);
      expect(result.sleep.completedDurationMs).toBe(hours * 3_600_000);
      expect(result.feeding.dayCount).toBe(1);
      expect(result.diapers.dayCount).toBe(1);
    },
  );

  it('keeps active sleep separate until canonical completion', async () => {
    sleep('completed', 'a', dayStart, dayStart + 100);
    db.prepare('INSERT INTO active_sleep_sessions VALUES (?, ?, ?)')
      .run('a', 'active', now - 1000);
    const before = await summary();
    expect(before.sleep.completedDurationMs).toBe(100);
    expect(before.sleep.active).toMatchObject({ elapsedMs: 1000, clockMovedBackward: false });
    await runtime.sleep.complete('active');
    const after = await summary();
    expect(after.sleep.active).toBeNull();
    expect(after.sleep.completedDurationMs).toBe(1100);
  });

  it('does not count an unsaved finished breastfeeding timer', async () => {
    db.prepare(`INSERT INTO breastfeeding_timer_session
      (id, session_id, child_id, state, accumulated_left_ms, accumulated_right_ms, finished_at_epoch_ms)
      VALUES (1, 'timer', 'a', 'finished', 60000, 0, ?)`).run(now - 1000);
    expect((await summary()).feeding.dayCount).toBe(0);
    await runtime.feeding.saveFinishedBreastfeedingTimer();
    expect((await summary()).feeding).toEqual({ dayCount: 1, latestCompletedAtEpochMs: now - 1000 });
  });

  it('represents clock rollback without mutating active sleep', async () => {
    db.prepare('INSERT INTO active_sleep_sessions VALUES (?, ?, ?)').run('a', 'active', now + 1);
    expect((await summary()).sleep.active).toMatchObject({ elapsedMs: 0, clockMovedBackward: true });
    expect(db.prepare('SELECT id FROM active_sleep_sessions').get()).toEqual({ id: 'active' });
  });

  it('serializes one snapshot against child switching and feature writes', async () => {
    await summary();
    const gate = deferred();
    const original = readers.feeding.getCompletedSummary.bind(readers.feeding);
    const read = vi.spyOn(readers.feeding, 'getCompletedSummary').mockImplementationOnce(async (id, range) => {
      await gate.promise;
      return original(id, range);
    });
    const pending = runtime.today.getSummary();
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    let switched = false;
    const switchChild = runtime.children.setActiveChild('b').then(() => { switched = true; });
    const write = runtime.diapers.record({ timing: 'now', kind: 'wet' });
    await Promise.resolve();
    expect(switched).toBe(false);
    expect(db.prepare('SELECT child_id FROM active_child_selection').get()).toEqual({ child_id: 'a' });
    gate.resolve();
    expect(await pending).toMatchObject({ summary: { child: { id: 'a' }, diapers: { dayCount: 0 } } });
    await switchChild;
    const written = await write;
    // Diaper acquires the queue directly; setActiveChild awaits initialization first.
    expect(written.recordedEvent.childId).toBe('a');
    expect(await summary()).toMatchObject({ child: { id: 'b' }, diapers: { dayCount: 0 } });
  });

  it('captures the clock after a preceding queue operation crossing midnight', async () => {
    await summary();
    const gate = deferred();
    const original = readers.feeding.getCompletedSummary.bind(readers.feeding);
    const read = vi.spyOn(readers.feeding, 'getCompletedSummary').mockImplementationOnce(async (id, range) => {
      await gate.promise; return original(id, range);
    });
    const earlier = runtime.today.getSummary();
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    const next = runtime.today.getSummary();
    now = dayEnd;
    gate.resolve();
    await earlier;
    expect(await next).toMatchObject({ summary: {
      capturedAtEpochMs: dayEnd, day: { calendarDate: '2026-10-08' }, age: { fullDays: 2 },
    } });
  });

  it('sanitizes failures, releases the queue and supports explicit retry', async () => {
    await summary();
    vi.spyOn(readers.feeding, 'getCompletedSummary').mockRejectedValueOnce(new Error('secret SQL/key/path'));
    const error = await runtime.today.getSummary().catch((reason: unknown) => reason);
    expect(error).toEqual(new AppRuntimeError('local-data-unavailable'));
    expect(String(error)).not.toContain('secret');
    expect((await summary()).child.id).toBe('a');
    await runtime.children.setActiveChild('b');
    expect((await summary()).child.id).toBe('b');
  });

  it('returns safe missing, not onboarding, without feature reads', async () => {
    await summary();
    const read = vi.spyOn(readers.feeding, 'getCompletedSummary');
    db.exec('DELETE FROM active_child_selection;');
    expect(await runtime.today.getSummary()).toEqual({ status: 'missing-active-child' });
    expect(read).not.toHaveBeenCalled();
  });

  it('safely rejects a clock before birth and later recovers', async () => {
    now = Date.parse('2026-10-05T12:00:00Z');
    await expect(runtime.today.getSummary()).rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
    now = dayStart;
    expect((await summary()).age.fullDays).toBe(1);
  });

  it('waits for accepted queued reads before closing and rejects new operations', async () => {
    await summary();
    const gate = deferred();
    const original = readers.feeding.getCompletedSummary.bind(readers.feeding);
    const read = vi.spyOn(readers.feeding, 'getCompletedSummary').mockImplementationOnce(async (id, range) => {
      await gate.promise; return original(id, range);
    });
    const pending = runtime.today.getSummary();
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    const queued = runtime.today.getSummary();
    const closing = runtime.close();
    expect(closeSpy).not.toHaveBeenCalled();
    await expect(runtime.today.getSummary()).rejects.toEqual(new AppRuntimeError('runtime-closed'));
    gate.resolve();
    await pending; await queued; await closing;
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('validates query arguments before reading and rejects corrupt persisted sleep', async () => {
    await summary();
    const day = getLocalDayContext(now);
    await expect(readers.feeding.getCompletedSummary('', day)).rejects.toThrow();
    await expect(readers.diapers.getEventSummary('a', { ...day, endEpochMs: day.startEpochMs })).rejects.toThrow();
    await expect(readers.sleep.listCompletedOverlapping('', day)).rejects.toThrow();
    db.exec('PRAGMA ignore_check_constraints = ON;');
    sleep('bad', 'a', now, now - 1);
    await expect(runtime.today.getSummary()).rejects.toEqual(new AppRuntimeError('local-data-unavailable'));
  });
});

describe('Today presentation with the authoritative SQLite runtime', () => {
  it('invalidates a pending snapshot before switching and publishes only the new child', async () => {
    const states: import('../presentation/today-controller').TodayState[] = [];
    const { createTodayController } = await import('../presentation/today-controller');
    const controller = createTodayController(runtime.today, state => states.push(state));
    const unsubscribe = runtime.today.subscribeSelectionChange!(switching => controller.selectionChanged(switching));
    controller.activate();
    await controller.refresh();
    expect(states.at(-1)).toMatchObject({ status: 'ready', summary: { child: { id: 'a' } } });
    void controller.refresh();
    const switchIndex = states.length;
    const selection = runtime.children.setActiveChild('b');
    expect(states.at(-1)).toEqual({ status: 'loading' });
    await selection;
    await controller.refresh();
    expect(states.at(-1)).toMatchObject({ status: 'ready', summary: { child: { id: 'b' } } });

    expect(states.slice(switchIndex).some(state => state.status === 'ready' && state.summary.child.id === 'a')).toBe(false);
    controller.deactivate(); unsubscribe();
  });
});
