import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMigratedTestDatabase } from './migrated-test-database.test-helper';
import { migrateLocalDatabase, type LocalMigrationDatabase } from './migrations';

function adapter(database: DatabaseSync): LocalMigrationDatabase {
  return {
    async execAsync(sql: string) { database.exec(sql); },
    async getFirstAsync<T>(sql: string) {
      return (database.prepare(sql).get() as T | undefined) ?? null;
    },
  };
}

const existingTables = [
  'children',
  'active_child_selection',
  'feeding_events',
  'breastfeeding_timer_session',
  'sleep_events',
  'active_sleep_sessions',
  'diaper_events',
  'growth_measurements',
] as const;

function snapshot(database: DatabaseSync) {
  return existingTables.map((table) => database.prepare(`SELECT * FROM ${table}`).all());
}

async function populatedV7(): Promise<DatabaseSync> {
  const database = await createMigratedTestDatabase();
  database.exec(`
    DROP TABLE milestone_entries;
    PRAGMA user_version = 7;
    INSERT INTO children VALUES ('child', 'Mio', '2024-01-01');
    INSERT INTO active_child_selection VALUES (1, 'child');
    INSERT INTO feeding_events (
      id, child_id, occurred_at_epoch_ms, kind,
      left_duration_seconds, right_duration_seconds
    ) VALUES ('feeding', 'child', 100, 'breast', 60, 0);
    INSERT INTO breastfeeding_timer_session (
      id, session_id, child_id, state, accumulated_left_ms,
      accumulated_right_ms, resume_side
    ) VALUES (1, 'timer', 'child', 'paused', 100, 200, 'left');
    INSERT INTO sleep_events VALUES ('sleep', 'child', 100, 200);
    INSERT INTO active_sleep_sessions VALUES ('child', 'active-sleep', 300);
    INSERT INTO diaper_events VALUES ('diaper', 'child', 100, 'wet');
    INSERT INTO growth_measurements (
      id, child_id, measured_on, weight_grams
    ) VALUES ('growth', 'child', '2024-02-29', 3450);
  `);
  return database;
}

describe('Milestone migration v8', () => {
  it('creates the constrained table and deterministic history index on a fresh database', async () => {
    const database = await createMigratedTestDatabase();
    try {
      expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 });
      expect(database.prepare(
        "SELECT name FROM sqlite_master WHERE name = 'milestone_entries_child_date_id_idx'",
      ).get()).toEqual({ name: 'milestone_entries_child_date_id_idx' });
      expect(database.prepare('SELECT * FROM milestone_entries').all()).toEqual([]);
      const indexColumns = database.prepare(
        "PRAGMA index_xinfo('milestone_entries_child_date_id_idx')",
      ).all() as { name: string | null; desc: number; key: number }[];
      expect(indexColumns.filter(({ key }) => key === 1).map(({ name, desc }) => ({ name, desc })))
        .toEqual([
          { name: 'child_id', desc: 0 },
          { name: 'occurred_on', desc: 1 },
          { name: 'id', desc: 1 },
        ]);
      database.exec(`
        INSERT INTO children VALUES ('child', 'Mio', '2024-01-01');
        INSERT INTO milestone_entries (id, child_id, definition_id, occurred_on)
          VALUES ('default-revision', 'child', 'social.first-smile', '2024-02-01');
      `);
      expect(database.prepare(
        "SELECT revision FROM milestone_entries WHERE id = 'default-revision'",
      ).get()).toEqual({ revision: 1 });
    } finally { database.close(); }
  });

  it('upgrades populated v7 without altering existing product data or schemas', async () => {
    const database = await populatedV7();
    try {
      const records = snapshot(database);
      const schema = database.prepare('SELECT name, sql FROM sqlite_master ORDER BY name').all();
      await migrateLocalDatabase(adapter(database));
      expect(snapshot(database)).toEqual(records);
      expect(database.prepare(
        "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'milestone_entries%' " +
          "AND name NOT LIKE 'sqlite_autoindex_milestone_entries%' ORDER BY name",
      ).all()).toEqual(schema);
      expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 });
    } finally { database.close(); }
  });

  it.each([
    'CREATE INDEX milestone_entries',
    'PRAGMA user_version = 8;',
    'COMMIT;',
  ])('rolls back v8 and preserves v7 data after failure at %s', async (marker) => {
    const database = await populatedV7();
    try {
      const records = snapshot(database);
      const migration = adapter(database);
      await expect(migrateLocalDatabase({
        ...migration,
        async execAsync(sql) {
          if (sql.includes(marker)) {
            if (marker.startsWith('CREATE INDEX')) database.exec(sql);
            throw new Error('sensitive native failure');
          }
          database.exec(sql);
        },
      })).rejects.toMatchObject({ code: 'migration-failed' });
      expect(snapshot(database)).toEqual(records);
      expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 });
      expect(database.prepare(
        "SELECT name FROM sqlite_master WHERE name LIKE '%milestone_entries%'",
      ).all()).toEqual([]);
      await migrateLocalDatabase(adapter(database));
      expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 8 });
    } finally { database.close(); }
  });

  it('reopens a file-backed v8 database without rerunning migrations or changing rows', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mybaby-milestones-v8-'));
    const path = join(directory, 'test.db');
    let database: DatabaseSync | null = new DatabaseSync(path);
    try {
      database.exec('PRAGMA foreign_keys = ON;');
      await migrateLocalDatabase(adapter(database));
      database.exec(`
        INSERT INTO children VALUES ('child', 'Mio', '2024-01-01');
        INSERT INTO milestone_entries (
          id, child_id, definition_id, occurred_on
        ) VALUES ('milestone', 'child', 'social.first-smile', '2024-02-29');
      `);
      const rows = database.prepare('SELECT * FROM milestone_entries').all();
      database.close();
      database = new DatabaseSync(path);
      const migration = adapter(database);
      await migrateLocalDatabase({
        ...migration,
        async execAsync() { throw new Error('Unexpected migration'); },
      });
      expect(database.prepare('SELECT * FROM milestone_entries').all()).toEqual(rows);
    } finally {
      database?.close();
      const resolvedDirectory = resolve(directory);
      if (
        resolvedDirectory.startsWith(resolve(tmpdir()) + '/') ||
        resolvedDirectory.startsWith(resolve(tmpdir()) + '\\')
      ) {
        rmSync(path);
        rmdirSync(directory);
      }
    }
  });

  it('enforces subject, title, note, date, revision, and required-field constraints', async () => {
    const database = await createMigratedTestDatabase();
    try {
      database.exec("INSERT INTO children VALUES ('child', 'Mio', '2024-01-01');");
      const valid = {
        id: 'milestone', child_id: 'child', definition_id: 'social.first-smile',
        custom_title: null, note: null, occurred_on: '2024-02-29', revision: 1,
      };
      const insert = (patch: Record<string, unknown>) => {
        const row = { ...valid, ...patch };
        return database.prepare('INSERT INTO milestone_entries VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(...Object.values(row) as (string | number | null)[]);
      };
      const invalid = [
        { id: '' }, { id: ' ' }, { id: null }, { child_id: '' }, { child_id: ' ' },
        { child_id: null }, { definition_id: null, custom_title: null },
        { custom_title: 'both' }, { definition_id: '' }, { definition_id: ' ' },
        { definition_id: null, custom_title: '' },
        { definition_id: null, custom_title: ' ' },
        { definition_id: null, custom_title: 'x'.repeat(81) },
        { note: '' }, { note: ' ' }, { note: 'x'.repeat(501) },
        { occurred_on: null }, { occurred_on: '2024-2-29' }, { occurred_on: '2024/02/29' },
        { revision: null }, { revision: 0 }, { revision: -1 }, { revision: 1.5 },
        { revision: Number.MAX_SAFE_INTEGER + 1 },
      ];
      for (const [index, patch] of invalid.entries()) {
        expect(() => insert({ id: `invalid-${index}`, ...patch })).toThrow();
      }
      expect(() => insert({ id: 'predefined' })).not.toThrow();
      expect(() => insert({
        id: 'custom', definition_id: null, custom_title: 'Egen milstolpe',
        note: 'Kort anteckning',
      })).not.toThrow();
      expect(() => insert({
        id: 'boundaries', definition_id: null, custom_title: 't'.repeat(80),
        note: 'n'.repeat(500),
      })).not.toThrow();
      // SQL validates shape; full calendar validity is deliberately a domain/repository rule.
      expect(() => insert({ id: 'structural-date', occurred_on: '2023-02-29' })).not.toThrow();
    } finally { database.close(); }
  });

  it('enforces foreign keys and cascades only the deleted child\'s entries', async () => {
    const database = await createMigratedTestDatabase();
    try {
      database.exec(`
        INSERT INTO children VALUES
          ('a', 'A', '2024-01-01'),
          ('b', 'B', '2024-01-01');
        INSERT INTO milestone_entries (id, child_id, definition_id, occurred_on)
          VALUES ('a-entry', 'a', 'social.first-smile', '2024-02-01'),
                 ('b-entry', 'b', 'social.first-smile', '2024-02-01');
      `);
      expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
      expect(() => database.exec(`
        INSERT INTO milestone_entries (id, child_id, definition_id, occurred_on)
          VALUES ('missing', 'missing', 'social.first-smile', '2024-02-01');
      `)).toThrow();
      database.prepare('DELETE FROM children WHERE id = ?').run('a');
      expect(database.prepare('SELECT id FROM milestone_entries ORDER BY id').all())
        .toEqual([{ id: 'b-entry' }]);
    } finally { database.close(); }
  });
});
