import { describe, expect, it } from 'vitest';

import {
  LATEST_LOCAL_DATABASE_VERSION,
  migrateLocalDatabase,
  type LocalMigrationDatabase,
} from './migrations';

class FakeMigrationDatabase implements LocalMigrationDatabase {
  readonly executedStatements: string[] = [];
  transactionCount = 0;
  committedTransactionCount = 0;
  rolledBackTransactionCount = 0;

  constructor(
    private version: number,
    private readonly failWhenStatementContains?: string,
    private readonly failRollback = false,
  ) {}

  async getFirstAsync<T>(source: string): Promise<T | null> {
    expect(source).toBe('PRAGMA user_version;');
    return { user_version: this.version } as T;
  }

  private pendingVersion: number | null = null;

  async execAsync(source: string): Promise<void> {
    this.executedStatements.push(source);

    if (source === 'BEGIN IMMEDIATE;') {
      this.transactionCount += 1;
      this.pendingVersion = this.version;
      return;
    }

    if (source === 'ROLLBACK;') {
      this.rolledBackTransactionCount += 1;
      this.pendingVersion = null;

      if (this.failRollback) {
        throw new Error('native rollback failure with sensitive details');
      }

      return;
    }

    if (source.includes(this.failWhenStatementContains ?? '\u0000')) {
      throw new Error('native error with sensitive details');
    }

    const versionMatch = source.match(/PRAGMA user_version = (\d+);/);
    if (versionMatch) {
      this.pendingVersion = Number(versionMatch[1]);
      return;
    }

    if (source === 'COMMIT;') {
      if (this.pendingVersion === null) {
        throw new Error('No active transaction.');
      }

      this.version = this.pendingVersion;
      this.pendingVersion = null;
      this.committedTransactionCount += 1;
    }
  }

  get userVersion(): number {
    return this.version;
  }
}

describe('local database migrations', () => {
  it('applies pending migrations sequentially from version 0', async () => {
    const database = new FakeMigrationDatabase(0);

    await migrateLocalDatabase(database);

    expect(database.userVersion).toBe(LATEST_LOCAL_DATABASE_VERSION);
    expect(database.transactionCount).toBe(3);
    expect(database.committedTransactionCount).toBe(3);
    expect(database.rolledBackTransactionCount).toBe(0);
    expect(database.executedStatements).toHaveLength(12);
    expect(database.executedStatements[0]).toBe('BEGIN IMMEDIATE;');
    expect(database.executedStatements[1]).toContain('CREATE TABLE children');
    expect(database.executedStatements[1]).toContain('id TEXT PRIMARY KEY NOT NULL');
    expect(database.executedStatements[1]).toContain(
      'display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)',
    );
    expect(database.executedStatements[1]).toContain("date_of_birth GLOB");
    expect(database.executedStatements[1]).not.toContain(
      '__mybaby_sqlcipher_verification',
    );
    expect(database.executedStatements[2]).toBe('PRAGMA user_version = 1;');
    expect(database.executedStatements[3]).toBe('COMMIT;');
    expect(database.executedStatements[4]).toBe('BEGIN IMMEDIATE;');
    expect(database.executedStatements[5]).toContain(
      'CREATE TABLE active_child_selection',
    );
    expect(database.executedStatements[6]).toBe('PRAGMA user_version = 2;');
    expect(database.executedStatements[7]).toBe('COMMIT;');
    expect(database.executedStatements[8]).toBe('BEGIN IMMEDIATE;');
    expect(database.executedStatements[9]).toContain('CREATE TABLE feeding_events');
    expect(database.executedStatements[10]).toBe('PRAGMA user_version = 3;');
    expect(database.executedStatements[11]).toBe('COMMIT;');
  });

  it('migrates version 1 through version 3 without selecting an existing child', async () => {
    const database = new FakeMigrationDatabase(1);

    await migrateLocalDatabase(database);

    expect(database.userVersion).toBe(3);
    expect(database.transactionCount).toBe(2);
    expect(database.executedStatements).toHaveLength(8);
    expect(database.executedStatements[0]).toBe('BEGIN IMMEDIATE;');
    const schema = database.executedStatements[1];
    expect(schema).toContain('CREATE TABLE active_child_selection');
    expect(schema).toContain('id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1)');
    expect(schema).toContain('child_id TEXT NOT NULL');
    expect(schema).toContain(
      'FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE',
    );
    expect(schema).not.toMatch(/\bINSERT\b/i);
    expect(schema).not.toContain('created_at');
    expect(schema).not.toContain('updated_at');
    expect(schema).not.toContain('user_id');
    expect(schema).not.toContain('account_id');
    expect(schema).not.toContain('sync');
    expect(database.executedStatements[2]).toBe('PRAGMA user_version = 2;');
    expect(database.executedStatements[3]).toBe('COMMIT;');
    expect(database.executedStatements[4]).toBe('BEGIN IMMEDIATE;');
    expect(database.executedStatements[5]).toContain('CREATE TABLE feeding_events');
    expect(database.executedStatements[6]).toBe('PRAGMA user_version = 3;');
    expect(database.executedStatements[7]).toBe('COMMIT;');
  });

  it('migrates version 2 to version 3 with the constrained feeding schema', async () => {
    const database = new FakeMigrationDatabase(2);

    await migrateLocalDatabase(database);

    expect(database.userVersion).toBe(3);
    expect(database.transactionCount).toBe(1);
    const schema = database.executedStatements[1];
    expect(schema).toContain('CREATE TABLE feeding_events');
    expect(schema).toContain('FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE');
    expect(schema).toContain("kind TEXT NOT NULL CHECK (kind IN ('breast', 'bottle'))");
    expect(schema).toContain("typeof(occurred_at_epoch_ms) = 'integer'");
    expect(schema).toContain('left_duration_seconds + right_duration_seconds > 0');
    expect(schema).toContain('amount_tenths_ml IS NULL');
    expect(schema).toContain("contents IN ('expressed-breast-milk', 'formula', 'mixed')");
    expect(schema).toContain('left_duration_seconds IS NULL');
    expect(schema).toContain("typeof(amount_tenths_ml) = 'integer'");
    expect(schema).not.toMatch(/created_at|updated_at|notes|sync|user_id|server/i);
    expect(database.executedStatements).toEqual([
      'BEGIN IMMEDIATE;',
      schema,
      'PRAGMA user_version = 3;',
      'COMMIT;',
    ]);
  });

  it('does nothing when the database is already at version 3', async () => {
    const database = new FakeMigrationDatabase(3);

    await migrateLocalDatabase(database);

    expect(database.transactionCount).toBe(0);
    expect(database.executedStatements).toEqual([]);
  });

  it('rejects a schema version newer than the app supports', async () => {
    const database = new FakeMigrationDatabase(4);

    await expect(migrateLocalDatabase(database)).rejects.toMatchObject({
      code: 'unsupported-database-version',
    });
    expect(database.transactionCount).toBe(0);
  });

  it('rolls back a failed version 2 migration without advancing user_version', async () => {
    const database = new FakeMigrationDatabase(2, 'CREATE TABLE feeding_events');

    const error = await migrateLocalDatabase(database).catch((reason: unknown) => reason);

    expect(database.userVersion).toBe(2);
    expect(database.committedTransactionCount).toBe(0);
    expect(database.rolledBackTransactionCount).toBe(1);
    expect(database.executedStatements).toHaveLength(3);
    expect(database.executedStatements[0]).toBe('BEGIN IMMEDIATE;');
    expect(database.executedStatements[1]).toContain(
      'CREATE TABLE feeding_events',
    );
    expect(database.executedStatements[2]).toBe('ROLLBACK;');
    expect(error).toMatchObject({ code: 'migration-failed' });
    expect(String(error)).not.toContain('sensitive details');
  });

  it('rolls back the pending user_version when commit fails', async () => {
    const database = new FakeMigrationDatabase(2, 'COMMIT;');

    await expect(migrateLocalDatabase(database)).rejects.toMatchObject({
      code: 'migration-failed',
    });

    expect(database.userVersion).toBe(2);
    expect(database.committedTransactionCount).toBe(0);
    expect(database.rolledBackTransactionCount).toBe(1);
    expect(database.executedStatements.slice(-3)).toEqual([
      'PRAGMA user_version = 3;',
      'COMMIT;',
      'ROLLBACK;',
    ]);
  });

  it('does not let rollback failure replace the sanitized migration failure', async () => {
    const database = new FakeMigrationDatabase(
      2,
      'CREATE TABLE feeding_events',
      true,
    );

    const error = await migrateLocalDatabase(database).catch(
      (reason: unknown) => reason,
    );

    expect(database.userVersion).toBe(2);
    expect(database.rolledBackTransactionCount).toBe(1);
    expect(database.executedStatements.at(-1)).toBe('ROLLBACK;');
    expect(error).toMatchObject({ code: 'migration-failed' });
    expect(String(error)).not.toContain('rollback failure');
  });
});
