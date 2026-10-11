import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import type { ReminderCursor } from '../application/reminder-repository';
import {
  createReminder,
  MAX_REMINDER_EPOCH_MS,
  type Reminder,
} from '../domain/reminder';
import {
  SqliteReminderRepository,
  type ReminderDatabase,
} from './sqlite-reminder-repository';

function adapter(database: DatabaseSync): ReminderDatabase {
  return {
    async getFirstAsync<T>(sql: string, params: (string | number | null)[]) {
      return (database.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params: (string | number | null)[]) {
      return database.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql, params) {
      return {
        changes: Number((database.prepare(sql).run(...params) as { changes: number | bigint }).changes),
      };
    },
  };
}

const reminder = createReminder({
  id: 'reminder-1',
  childId: 'child',
  title: 'BVC-besök',
  scheduledAtEpochMs: Date.UTC(2026, 9, 10, 12, 30),
  revision: 1,
});

describe('Reminder SQLite repository', () => {
  let database: DatabaseSync;
  let repository: SqliteReminderRepository;

  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.exec(`
      INSERT INTO children VALUES
        ('child', 'Mio', '2024-01-01'),
        ('other', 'Mira', '2024-01-01');
    `);
    repository = new SqliteReminderRepository(adapter(database));
  });

  afterEach(() => database.close());

  it('creates and reads an exact normalized reminder', async () => {
    await repository.create({ ...reminder, title: '  BVC-besök  ' });
    await expect(repository.getById('child', reminder.id)).resolves.toEqual(reminder);
    expect(database.prepare('SELECT * FROM reminders WHERE id = ?').get(reminder.id)).toEqual({
      id: reminder.id,
      child_id: 'child',
      title: 'BVC-besök',
      scheduled_at_epoch_ms: reminder.scheduledAtEpochMs,
      revision: 1,
    });
  });

  it('keeps reads and mutations child-scoped', async () => {
    await repository.create(reminder);
    await expect(repository.getById('other', reminder.id)).resolves.toBeNull();
    await expect(repository.deleteIfMatches({ ...reminder, childId: 'other' })).resolves.toBe(false);
    await expect(repository.updateIfMatches(
      { ...reminder, childId: 'other' },
      { ...reminder, childId: 'other', revision: 2 },
    )).resolves.toBe(false);
    await expect(repository.getById('child', reminder.id)).resolves.toEqual(reminder);
    await expect(repository.listByChild('other', 20)).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('updates with one revision CAS while preserving identity and child', async () => {
    await repository.create(reminder);
    const replacement = createReminder({
      ...reminder,
      title: 'Vaccination',
      scheduledAtEpochMs: reminder.scheduledAtEpochMs + 60_000,
      revision: 2,
    });
    await expect(repository.updateIfMatches(reminder, replacement)).resolves.toBe(true);
    await expect(repository.getById('child', reminder.id)).resolves.toEqual(replacement);
    await expect(repository.updateIfMatches(reminder, { ...replacement, title: 'Stale' }))
      .resolves.toBe(false);
    for (const patch of [
      { id: 'different' },
      { childId: 'other' },
      { revision: 2 },
      { revision: 4 },
    ]) {
      await expect(repository.updateIfMatches(replacement, {
        ...replacement,
        revision: 3,
        ...patch,
      })).rejects.toThrow();
    }
  });

  it('deletes only an exact child/id/revision match', async () => {
    await repository.create(reminder);
    await expect(repository.deleteIfMatches({ ...reminder, revision: 2 })).resolves.toBe(false);
    await expect(repository.deleteIfMatches({ ...reminder, childId: 'other' })).resolves.toBe(false);
    await expect(repository.deleteIfMatches(reminder)).resolves.toBe(true);
    await expect(repository.deleteIfMatches(reminder)).resolves.toBe(false);
  });

  it('paginates ascending instant/id order without gaps or duplicates', async () => {
    for (let index = 0; index < 57; index += 1) {
      await repository.create(createReminder({
        ...reminder,
        id: String(index).padStart(3, '0'),
        scheduledAtEpochMs: reminder.scheduledAtEpochMs + (index < 30 ? 0 : 60_000),
      }));
    }
    await repository.create(createReminder({ ...reminder, id: 'foreign', childId: 'other' }));

    const seen: string[] = [];
    let cursor: ReminderCursor | null = null;
    do {
      const page = await repository.listByChild('child', 7, cursor);
      seen.push(...page.items.map(({ id }) => id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    const expected = database.prepare(`
      SELECT id FROM reminders
      WHERE child_id = ? ORDER BY scheduled_at_epoch_ms ASC, id ASC
    `).all('child').map((row) => (row as { id: string }).id);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(57);

    const first = await repository.listByChild('child', 7);
    await repository.deleteIfMatches(first.items.at(-1)!);
    expect((await repository.listByChild('child', 7, first.nextCursor)).items[0]?.id)
      .toBe(seen[7]);
  });

  it('pages only future reminders from an exclusive epoch boundary', async () => {
    for (const [id, scheduledAtEpochMs] of [
      ['past', 900],
      ['boundary', 1_000],
      ['future-a', 1_001],
      ['future-b', 1_001],
      ['future-c', 2_000],
    ] as const) {
      await repository.create(createReminder({ ...reminder, id, scheduledAtEpochMs }));
    }
    await repository.create(createReminder({
      ...reminder, id: 'foreign-future', childId: 'other', scheduledAtEpochMs: 1_001,
    }));

    const first = await repository.listUpcomingByChild('child', 1_000, 2);
    expect(first.items.map(({ id }) => id)).toEqual(['future-a', 'future-b']);
    expect(first.nextCursor).toEqual({
      childId: 'child', id: 'future-b', scheduledAtEpochMs: 1_001,
    });
    await expect(repository.listUpcomingByChild(
      'child', 1_000, 2, first.nextCursor,
    )).resolves.toMatchObject({ items: [{ id: 'future-c' }], nextCursor: null });
  });

  it('rejects foreign or malformed cursors, identities, and invalid page sizes', async () => {
    await expect(repository.getById('', reminder.id)).rejects.toThrow();
    await expect(repository.getById('child', ' ')).rejects.toThrow();
    await expect(repository.listByChild('', 20)).rejects.toThrow();
    await expect(repository.listByChild('child', 20, {
      childId: 'other', scheduledAtEpochMs: reminder.scheduledAtEpochMs, id: reminder.id,
    })).rejects.toThrow();
    await expect(repository.listUpcomingByChild('child', 1_000, 20, {
      childId: 'other', scheduledAtEpochMs: 1_001, id: reminder.id,
    })).rejects.toThrow();
    await expect(repository.listUpcomingByChild('child', 1_000, 20, {
      childId: 'child', scheduledAtEpochMs: 1_000, id: reminder.id,
    })).rejects.toThrow();
    await expect(repository.listUpcomingByChild('child', 1.5, 20)).rejects.toThrow();
    await expect(repository.listByChild('child', 20, {
      childId: 'child', scheduledAtEpochMs: 1.5, id: reminder.id,
    })).rejects.toThrow();
    await expect(repository.listByChild('child', 20, {
      childId: 'child', scheduledAtEpochMs: reminder.scheduledAtEpochMs, id: ' ',
    })).rejects.toThrow();
    for (const limit of [0, -1, 101, 1.5, NaN]) {
      await expect(repository.listByChild('child', limit)).rejects.toThrow();
    }
  });

  it.each([
    { id: '' },
    { child_id: 'other' },
    { title: '  not canonical  ' },
    { title: '' },
    { title: 123 },
    { scheduled_at_epoch_ms: 1.5 },
    { scheduled_at_epoch_ms: MAX_REMINDER_EPOCH_MS + 1 },
    { scheduled_at_epoch_ms: '1000' },
    { revision: 0 },
    { revision: 1.5 },
    { revision: '1' },
  ])('rejects malformed persisted row %j', async (patch) => {
    const row = {
      id: reminder.id,
      child_id: 'child',
      title: reminder.title,
      scheduled_at_epoch_ms: reminder.scheduledAtEpochMs,
      revision: 1,
      ...patch,
    };
    const malformed = new SqliteReminderRepository({
      async getFirstAsync<T>() { return row as T; },
      async getAllAsync<T>() { return [row] as T[]; },
      async runAsync() { return { changes: 0 }; },
    });
    await expect(malformed.getById('child', reminder.id)).rejects.toThrow();
    await expect(malformed.listByChild('child', 20)).rejects.toThrow();
  });

  it('propagates one requested database failure without retries', async () => {
    const error = new Error('ambiguous native failure');
    const getFirstAsync = vi.fn(async () => { throw error; });
    const getAllAsync = vi.fn(async () => { throw error; });
    const runAsync = vi.fn(async () => { throw error; });
    const failing = new SqliteReminderRepository({ getFirstAsync, getAllAsync, runAsync });
    const replacement = createReminder({ ...reminder, revision: 2 });
    await expect(failing.create(reminder)).rejects.toBe(error);
    await expect(failing.getById('child', reminder.id)).rejects.toBe(error);
    await expect(failing.listByChild('child', 20)).rejects.toBe(error);
    await expect(failing.listUpcomingByChild('child', 0, 20)).rejects.toBe(error);
    await expect(failing.updateIfMatches(reminder, replacement)).rejects.toBe(error);
    await expect(failing.deleteIfMatches(reminder)).rejects.toBe(error);
    expect(runAsync).toHaveBeenCalledTimes(3);
    expect(getFirstAsync).toHaveBeenCalledOnce();
    expect(getAllAsync).toHaveBeenCalledTimes(2);
  });

  it('binds every value and uses neither replacement nor upsert SQL', async () => {
    const runAsync = vi.fn(async (
      _sql: string,
      _params: (string | number | null)[],
    ) => ({ changes: 1 }));
    const bound = new SqliteReminderRepository({ ...adapter(database), runAsync });
    await bound.create(reminder);
    const replacement = createReminder({ ...reminder, title: 'Ny tid', revision: 2 });
    await bound.updateIfMatches(reminder, replacement);
    await bound.deleteIfMatches(replacement);
    for (const [sql] of runAsync.mock.calls) {
      expect(sql).not.toMatch(/REPLACE|ON\s+CONFLICT/i);
    }
    expect(runAsync.mock.calls[0]?.[1]).toEqual([
      reminder.id, 'child', 'BVC-besök', reminder.scheduledAtEpochMs, 1,
    ]);
    expect(runAsync.mock.calls[1]?.[1]).toEqual([
      'Ny tid', reminder.scheduledAtEpochMs, 2, 'child', reminder.id, 1,
    ]);
    expect(runAsync.mock.calls[2]?.[1]).toEqual(['child', reminder.id, 2]);
  });

  it('rejects duplicate IDs and noninitial creates without hiding SQLite failures', async () => {
    await repository.create(reminder);
    await expect(repository.create(reminder)).rejects.toThrow();
    await expect(repository.create({ ...reminder, id: 'new', revision: 2 })).rejects.toThrow();
  });

  it('enforces SQL constraints, foreign keys, and child-delete cascade', async () => {
    const insert = database.prepare(`
      INSERT INTO reminders (id, child_id, title, scheduled_at_epoch_ms, revision)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const values of [
      ['', 'child', 'Title', 0, 1],
      ['blank-child', '', 'Title', 0, 1],
      ['blank-title', 'child', '', 0, 1],
      ['spaced-title', 'child', ' Title ', 0, 1],
      ['long-title', 'child', 'a'.repeat(101), 0, 1],
      ['real-time', 'child', 'Title', 1.5, 1],
      ['range-time', 'child', 'Title', MAX_REMINDER_EPOCH_MS + 1, 1],
      ['zero-revision', 'child', 'Title', 0, 0],
      ['real-revision', 'child', 'Title', 0, 1.5],
      ['missing-child', 'missing', 'Title', 0, 1],
    ] as const) {
      expect(() => insert.run(...values)).toThrow();
    }

    await repository.create(reminder);
    expect(database.prepare('SELECT COUNT(*) AS count FROM reminders').get()).toEqual({ count: 1 });
    database.exec("DELETE FROM children WHERE id = 'child';");
    expect(database.prepare('SELECT COUNT(*) AS count FROM reminders').get()).toEqual({ count: 0 });
  });
});
