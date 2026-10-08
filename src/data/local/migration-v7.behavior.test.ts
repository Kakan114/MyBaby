import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMigratedTestDatabase } from './migrated-test-database.test-helper';
import { migrateLocalDatabase, type LocalMigrationDatabase } from './migrations';

function adapter(db: DatabaseSync): LocalMigrationDatabase {
  return {
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync<T>(sql: string) { return (db.prepare(sql).get() as T | undefined) ?? null; },
  };
}
async function populatedV6() {
  const db = await createMigratedTestDatabase();
  db.exec(`DROP TABLE growth_measurements; PRAGMA user_version = 6;
    INSERT INTO children VALUES ('child', 'Mio', '2024-01-01');
    INSERT INTO active_child_selection VALUES (1, 'child');
    INSERT INTO feeding_events (id,child_id,occurred_at_epoch_ms,kind,left_duration_seconds,right_duration_seconds)
      VALUES ('feeding','child',100,'breast',60,0);
    INSERT INTO breastfeeding_timer_session (id,session_id,child_id,state,accumulated_left_ms,accumulated_right_ms,resume_side)
      VALUES (1,'timer','child','paused',100,200,'left');
    INSERT INTO sleep_events VALUES ('sleep','child',100,200);
    INSERT INTO active_sleep_sessions VALUES ('child','active',300);
    INSERT INTO diaper_events VALUES ('diaper','child',100,'wet');`);
  return db;
}
const tables = ['children', 'active_child_selection', 'feeding_events', 'breastfeeding_timer_session', 'sleep_events', 'active_sleep_sessions', 'diaper_events'];
const snapshot = (db: DatabaseSync) => tables.map(table => db.prepare(`SELECT * FROM ${table}`).all());
describe('Growth migration v7', () => {
  it('accepts technical ceilings, nullable partial sessions, and defaults revision to 1', async () => {
    const db = await createMigratedTestDatabase();
    try {
      db.exec("INSERT INTO children VALUES ('child','Mio','2024-01-01'); INSERT INTO growth_measurements (id,child_id,measured_on,weight_grams,length_mm,head_circumference_mm,length_method) VALUES ('max','child','2024-02-29',200000,3000,1000,'standing'),('head','child','2024-02-29',NULL,NULL,1,NULL),('length','child','2024-02-29',NULL,1,NULL,'unknown');");
      expect(db.prepare('SELECT revision FROM growth_measurements').all()).toEqual([{ revision: 1 }, { revision: 1 }, { revision: 1 }]);
    } finally { db.close(); }
  });
  it('creates constrained Growth table/index on a fresh database', async () => {
    const db = await createMigratedTestDatabase();
    try {
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'growth_measurements_child_date_id_idx'").get())
        .toEqual({ name: 'growth_measurements_child_date_id_idx' });
      expect(db.prepare('SELECT * FROM growth_measurements').all()).toEqual([]);
    } finally { db.close(); }
  });
  it('upgrades v6 without altering any existing rows or schemas', async () => {
    const db = await populatedV6();
    try {
      const records = snapshot(db);
      const schema = db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all();
      await migrateLocalDatabase(adapter(db));
      expect(snapshot(db)).toEqual(records);
      expect(db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'growth_measurements%' AND name NOT LIKE 'sqlite_autoindex_growth_measurements%' ORDER BY name").all()).toEqual(schema);
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 });
    } finally { db.close(); }
  });
  it.each(['CREATE INDEX growth_measurements', 'PRAGMA user_version = 7;', 'COMMIT;'])(
    'rolls back v7 and preserves all data after failure at %s', async marker => {
      const db = await populatedV6();
      try {
        const records = snapshot(db);
        const migration = adapter(db);
        await expect(migrateLocalDatabase({ ...migration, async execAsync(sql) {
          if (sql.includes(marker)) {
            if (marker.startsWith('CREATE INDEX')) db.exec(sql);
            throw new Error('sensitive native failure');
          }
          db.exec(sql);
        } })).rejects.toMatchObject({ code: 'migration-failed' });
        expect(snapshot(db)).toEqual(records);
        expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 6 });
        expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%growth_measurements%'").all()).toEqual([]);
        await migrateLocalDatabase(adapter(db));
        expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 7 });
      } finally { db.close(); }
    },
  );
  it('reopens a file-backed v7 database without running migrations or changing records', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mybaby-growth-v7-'));
    const path = join(directory, 'test.db');
    let db: DatabaseSync | null = new DatabaseSync(path);
    try {
      db.exec('PRAGMA foreign_keys = ON;');
      await migrateLocalDatabase(adapter(db));
      db.exec("INSERT INTO children VALUES ('child','Mio','2024-01-01'); INSERT INTO growth_measurements (id,child_id,measured_on,weight_grams) VALUES ('measurement','child','2024-02-29',3450);");
      const rows = db.prepare('SELECT * FROM growth_measurements').all();
      db.close(); db = new DatabaseSync(path);
      const migration = adapter(db);
      await migrateLocalDatabase({ ...migration, async execAsync() { throw new Error('Unexpected migration'); } });
      expect(db.prepare('SELECT * FROM growth_measurements').all()).toEqual(rows);
    } finally {
      db?.close();
      // Delete only this test-created file/directory, never app data or recursively.
      if (resolve(directory).startsWith(resolve(tmpdir()) + '/') || resolve(directory).startsWith(resolve(tmpdir()) + '\\')) {
        rmSync(path); rmdirSync(directory);
      }
    }
  });
  it('cascades child deletion only to that child\'s Growth sessions', async () => {
    const db = await createMigratedTestDatabase();
    try {
      db.exec("INSERT INTO children VALUES ('a','A','2024-01-01'),('b','B','2024-01-01'); INSERT INTO growth_measurements (id,child_id,measured_on,weight_grams) VALUES ('a','a','2024-01-01',1),('b','b','2024-01-01',1); DELETE FROM children WHERE id='a';");
      expect(db.prepare('SELECT id FROM growth_measurements').all()).toEqual([{ id: 'b' }]);
      expect(() => db.exec("INSERT INTO growth_measurements (id,child_id,measured_on,weight_grams) VALUES ('missing','a','2024-01-01',1);")).toThrow();
    } finally { db.close(); }
  });
  it.each([
    { id: '' }, { id: ' ' }, { child_id: '' }, { measured_on: '2024-2-29' }, { measured_on: '2024/02/29' },
    { measured_on: null }, { weight_grams: null }, { weight_grams: 0 }, { weight_grams: -1 },
    { weight_grams: 200001 }, { weight_grams: 1.5 }, { weight_grams: 'bad' },
    { length_mm: 0, length_method: 'lying' }, { length_mm: 3001, length_method: 'lying' },
    { length_mm: 1.5, length_method: 'lying' }, { length_mm: 512, length_method: null },
    { length_mm: 512, length_method: 'invalid' }, { length_method: 'unknown' },
    { head_circumference_mm: 0 }, { head_circumference_mm: 1001 }, { head_circumference_mm: 1.5 },
    { revision: 0 }, { revision: -1 }, { revision: 1.5 }, { revision: 9007199254740992 },
  ])('enforces database constraints %j', async patch => {
    const db = await createMigratedTestDatabase();
    try {
      db.exec("INSERT INTO children VALUES ('child','Mio','2024-01-01');");
      const row = { id: 'measurement', child_id: 'child', measured_on: '2024-02-29', weight_grams: 3450,
        length_mm: null, head_circumference_mm: null, length_method: null, revision: 1, ...patch };
      expect(() => db.prepare('INSERT INTO growth_measurements VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(...Object.values(row))).toThrow();
    } finally { db.close(); }
  });
});
