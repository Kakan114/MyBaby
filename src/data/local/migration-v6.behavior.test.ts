import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createMigratedTestDatabase } from './migrated-test-database.test-helper';
import { migrateLocalDatabase } from './migrations';

describe('version 6 migration behavior', () => {
  it('upgrades a populated version 5 database without changing existing product data', async () => {
    const database = await createMigratedTestDatabase();
    try {
      database.prepare('INSERT INTO children (id, display_name, date_of_birth) VALUES (?, ?, ?)')
        .run('child', 'Mio', '2025-01-01');
      database.prepare(`INSERT INTO feeding_events (
        id, child_id, occurred_at_epoch_ms, kind, left_duration_seconds,
        right_duration_seconds, amount_tenths_ml, contents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('feeding', 'child', 100, 'breast', 60, 0, null, null);
      database.prepare('INSERT INTO sleep_events (id, child_id, started_at_epoch_ms, ended_at_epoch_ms) VALUES (?, ?, ?, ?)')
        .run('sleep', 'child', 100, 200);
      database.exec('DROP TABLE diaper_events; PRAGMA user_version = 5;');

      await migrateLocalDatabase({
        async execAsync(source: string) { database.exec(source); },
        async getFirstAsync<T>(source: string) {
          return (database.prepare(source).get() as T | undefined) ?? null;
        },
      });

      expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 6 });
      expect(database.prepare('SELECT id FROM children').all()).toEqual([{ id: 'child' }]);
      expect(database.prepare('SELECT id FROM feeding_events').all()).toEqual([{ id: 'feeding' }]);
      expect(database.prepare('SELECT id FROM sleep_events').all()).toEqual([{ id: 'sleep' }]);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'diaper_events'").get())
        .toEqual({ name: 'diaper_events' });
    } finally {
      database.close();
    }
  });
});
