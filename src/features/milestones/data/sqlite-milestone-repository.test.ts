import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedTestDatabase } from '../../../data/local/migrated-test-database.test-helper';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { MilestoneHistoryCursor } from '../application/milestone-repository';
import { createMilestoneEntry, type MilestoneEntry } from '../domain/milestone-entry';
import {
  SqliteMilestoneRepository,
  type MilestoneDatabase,
} from './sqlite-milestone-repository';

function adapter(database: DatabaseSync): MilestoneDatabase {
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

const predefined = createMilestoneEntry({
  id: '00000000-0000-4000-8000-000000000001',
  childId: 'child',
  subject: { kind: 'predefined', definitionId: 'social.first-smile' },
  occurredOn: createCalendarDate('2024-02-29'),
  note: null,
  revision: 1,
});

const custom = createMilestoneEntry({
  ...predefined,
  id: '00000000-0000-4000-8000-000000000002',
  subject: { kind: 'custom', title: 'Första tågresan' },
  note: 'En fin dag.',
});

describe('Milestone SQLite repository', () => {
  let database: DatabaseSync;
  let repository: SqliteMilestoneRepository;

  beforeEach(async () => {
    database = await createMigratedTestDatabase();
    database.exec(`
      INSERT INTO children VALUES
        ('child', 'Mio', '2024-01-01'),
        ('other', 'Mira', '2024-01-01');
    `);
    repository = new SqliteMilestoneRepository(adapter(database));
  });

  afterEach(() => database.close());

  it('creates and reads predefined and custom entries exactly', async () => {
    await repository.create(predefined);
    await repository.create(custom);
    await expect(repository.getById('child', predefined.id)).resolves.toEqual(predefined);
    await expect(repository.getById('child', custom.id)).resolves.toEqual(custom);
    expect(database.prepare(`
      SELECT definition_id, custom_title, note FROM milestone_entries WHERE id = ?
    `).get(predefined.id)).toEqual({
      definition_id: 'social.first-smile', custom_title: null, note: null,
    });
    expect(database.prepare(`
      SELECT definition_id, custom_title, note FROM milestone_entries WHERE id = ?
    `).get(custom.id)).toEqual({
      definition_id: null, custom_title: 'Första tågresan', note: 'En fin dag.',
    });
  });

  it('returns null across child boundaries and validates identities before SQL', async () => {
    await repository.create(predefined);
    await expect(repository.getById('other', predefined.id)).resolves.toBeNull();
    await expect(repository.getById('', predefined.id)).rejects.toThrow();
    await expect(repository.getById('child', ' ')).rejects.toThrow();
    await expect(repository.listHistory('', 20)).rejects.toThrow();
  });

  it('updates editable values with one CAS revision while preserving identity and child', async () => {
    await repository.create(predefined);
    const replacement = createMilestoneEntry({
      ...predefined,
      subject: { kind: 'custom', title: 'Egen milstolpe' },
      note: 'Uppdaterad anteckning',
      occurredOn: createCalendarDate('2024-03-01'),
      revision: 2,
    });
    await expect(repository.updateIfMatches(predefined, replacement)).resolves.toBe(true);
    await expect(repository.getById('child', predefined.id)).resolves.toEqual(replacement);
    await expect(repository.updateIfMatches(predefined, {
      ...replacement,
      note: 'Stale',
    })).resolves.toBe(false);
    for (const patch of [
      { id: 'replacement-id' },
      { childId: 'other' },
      { revision: 1 },
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
    await repository.create(predefined);
    await expect(repository.deleteIfMatches({ ...predefined, revision: 2 })).resolves.toBe(false);
    await expect(repository.deleteIfMatches({ ...predefined, childId: 'other' })).resolves.toBe(false);
    await expect(repository.getById('child', predefined.id)).resolves.toEqual(predefined);
    await expect(repository.deleteIfMatches(predefined)).resolves.toBe(true);
    await expect(repository.deleteIfMatches(predefined)).resolves.toBe(false);
    await expect(repository.getById('child', predefined.id)).resolves.toBeNull();
  });

  it('paginates deterministic date/id order without missing or duplicating same-date entries', async () => {
    for (let index = 0; index < 57; index += 1) {
      await repository.create(createMilestoneEntry({
        ...predefined,
        id: String(index).padStart(3, '0'),
        occurredOn: createCalendarDate(index < 30 ? '2024-02-29' : '2024-03-01'),
      }));
    }
    await repository.create(createMilestoneEntry({ ...predefined, id: 'foreign', childId: 'other' }));
    const seen: string[] = [];
    let cursor: MilestoneHistoryCursor | null = null;
    do {
      const page = await repository.listHistory('child', 7, cursor);
      seen.push(...page.items.map(({ id }) => id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    const expected = database.prepare(`
      SELECT id FROM milestone_entries
      WHERE child_id = ? ORDER BY occurred_on DESC, id DESC
    `).all('child').map((row) => (row as { id: string }).id);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(57);

    const first = await repository.listHistory('child', 7);
    await repository.deleteIfMatches(first.items.at(-1)!);
    expect((await repository.listHistory('child', 7, first.nextCursor)).items[0].id)
      .toBe(seen[7]);
  });

  it('rejects foreign and malformed cursors and invalid page sizes', async () => {
    const foreign: MilestoneHistoryCursor = {
      childId: 'other', occurredOn: predefined.occurredOn, id: predefined.id,
    };
    await expect(repository.listHistory('child', 20, foreign)).rejects.toThrow();
    await expect(repository.listHistory('child', 20, {
      childId: 'child', occurredOn: '2023-02-29' as never, id: predefined.id,
    })).rejects.toThrow();
    await expect(repository.listHistory('child', 20, {
      childId: 'child', occurredOn: predefined.occurredOn, id: ' ',
    })).rejects.toThrow();
    for (const limit of [0, -1, 101, 1.5, NaN]) {
      await expect(repository.listHistory('child', limit)).rejects.toThrow();
    }
  });

  it('rejects unknown definitions and invalid actual dates persisted through structural SQL checks', async () => {
    database.exec(`
      INSERT INTO milestone_entries (
        id, child_id, definition_id, occurred_on
      ) VALUES
        ('unknown', 'child', 'motor.unknown', '2024-02-29'),
        ('invalid-date', 'child', 'social.first-smile', '2023-02-29');
    `);
    await expect(repository.getById('child', 'unknown')).rejects.toMatchObject({
      code: 'unknown-definition',
    });
    await expect(repository.getById('child', 'invalid-date')).rejects.toMatchObject({
      code: 'invalid-occurrence-date',
    });
    await expect(repository.listHistory('child', 20)).rejects.toThrow();
  });

  it('rejects persisted custom text that is valid SQL but not canonically normalized', async () => {
    database.exec(`
      INSERT INTO milestone_entries (
        id, child_id, custom_title, note, occurred_on
      ) VALUES
        ('title-space', 'child', '  Egen milstolpe  ', NULL, '2024-02-29'),
        ('note-space', 'child', 'Egen milstolpe', '  Anteckning  ', '2024-02-29');
    `);
    await expect(repository.getById('child', 'title-space')).rejects.toThrow();
    await expect(repository.getById('child', 'note-space')).rejects.toThrow();
  });

  it.each([
    { id: '' },
    { child_id: 'other' },
    { definition_id: null, custom_title: null },
    { definition_id: 'social.first-smile', custom_title: 'Both' },
    { definition_id: null, custom_title: '' },
    { note: 123 },
    { occurred_on: '2023-02-29' },
    { revision: '1' },
    { revision: 0 },
    { revision: 1.5 },
  ])('rejects malformed persisted row %j', async (patch) => {
    const row = {
      id: predefined.id,
      child_id: 'child',
      definition_id: 'social.first-smile',
      custom_title: null,
      note: null,
      occurred_on: predefined.occurredOn,
      revision: 1,
      ...patch,
    };
    const malformed = new SqliteMilestoneRepository({
      async getFirstAsync<T>() { return row as T; },
      async getAllAsync<T>() { return [row] as T[]; },
      async runAsync() { return { changes: 0 }; },
    });
    await expect(malformed.getById('child', predefined.id)).rejects.toThrow();
    await expect(malformed.listHistory('child', 20)).rejects.toThrow();
  });

  it('propagates one requested read/write failure without retry or reconciliation', async () => {
    const error = new Error('ambiguous native failure');
    const getFirstAsync = vi.fn(async () => { throw error; });
    const getAllAsync = vi.fn(async () => { throw error; });
    const runAsync = vi.fn(async () => { throw error; });
    const failing = new SqliteMilestoneRepository({ getFirstAsync, getAllAsync, runAsync });
    const replacement = createMilestoneEntry({ ...predefined, revision: 2 });
    await expect(failing.create(predefined)).rejects.toBe(error);
    await expect(failing.getById('child', predefined.id)).rejects.toBe(error);
    await expect(failing.listHistory('child', 20)).rejects.toBe(error);
    await expect(failing.updateIfMatches(predefined, replacement)).rejects.toBe(error);
    await expect(failing.deleteIfMatches(predefined)).rejects.toBe(error);
    expect(runAsync).toHaveBeenCalledTimes(3);
    expect(getFirstAsync).toHaveBeenCalledOnce();
    expect(getAllAsync).toHaveBeenCalledOnce();
  });

  it('binds all values and never uses replacement/upsert SQL', async () => {
    const runAsync = vi.fn(async (
      _sql: string,
      _params: (string | number | null)[],
    ) => ({ changes: 1 }));
    const bound = new SqliteMilestoneRepository({ ...adapter(database), runAsync });
    await bound.create(custom);
    const replacement = createMilestoneEntry({ ...custom, revision: 2, note: null });
    await bound.updateIfMatches(custom, replacement);
    await bound.deleteIfMatches(replacement);
    for (const [sql] of runAsync.mock.calls) {
      expect(sql).not.toMatch(/REPLACE|ON\s+CONFLICT/i);
    }
    expect(runAsync.mock.calls[0][1]).toEqual([
      custom.id, 'child', null, 'Första tågresan', 'En fin dag.', '2024-02-29', 1,
    ]);
    expect(runAsync.mock.calls[1][1]).toEqual([
      null, 'Första tågresan', null, '2024-02-29', 2,
      'child', custom.id, 1,
    ]);
    expect(runAsync.mock.calls[2][1]).toEqual(['child', custom.id, 2]);
  });

  it('rejects duplicate identities and noninitial creates without hiding SQLite failures', async () => {
    await repository.create(predefined);
    await expect(repository.create(predefined)).rejects.toThrow();
    await expect(repository.create({ ...custom, revision: 2 })).rejects.toThrow();
    await expect(repository.getById('child', predefined.id)).resolves.toEqual(predefined);
  });
});
