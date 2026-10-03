import { describe, expect, it } from 'vitest';

import {
  LATEST_LOCAL_DATABASE_VERSION,
  migrateLocalDatabase,
  type LocalMigrationDatabase,
  type LocalMigrationTransaction,
} from './migrations';

class FakeMigrationDatabase implements LocalMigrationDatabase {
  readonly executedStatements: string[] = [];
  transactionCount = 0;
  committedTransactionCount = 0;
  rolledBackTransactionCount = 0;

  constructor(
    private version: number,
    private readonly failWhenStatementContains?: string,
  ) {}

  async getFirstAsync<T>(source: string): Promise<T | null> {
    expect(source).toBe('PRAGMA user_version;');
    return { user_version: this.version } as T;
  }

  async withExclusiveTransactionAsync(
    task: (transaction: LocalMigrationTransaction) => Promise<void>,
  ): Promise<void> {
    this.transactionCount += 1;
    let pendingVersion = this.version;

    const transaction: LocalMigrationTransaction = {
      execAsync: async (source) => {
        this.executedStatements.push(source);

        if (source.includes(this.failWhenStatementContains ?? '\u0000')) {
          throw new Error('native error with sensitive details');
        }

        const versionMatch = source.match(/PRAGMA user_version = (\d+);/);
        if (versionMatch) {
          pendingVersion = Number(versionMatch[1]);
        }
      },
    };

    try {
      await task(transaction);
      this.version = pendingVersion;
      this.committedTransactionCount += 1;
    } catch (error) {
      this.rolledBackTransactionCount += 1;
      throw error;
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
    expect(database.transactionCount).toBe(2);
    expect(database.committedTransactionCount).toBe(2);
    expect(database.rolledBackTransactionCount).toBe(0);
    expect(database.executedStatements).toHaveLength(4);
    expect(database.executedStatements[0]).toContain('CREATE TABLE children');
    expect(database.executedStatements[0]).toContain('id TEXT PRIMARY KEY NOT NULL');
    expect(database.executedStatements[0]).toContain(
      'display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)',
    );
    expect(database.executedStatements[0]).toContain("date_of_birth GLOB");
    expect(database.executedStatements[0]).not.toContain(
      '__mybaby_sqlcipher_verification',
    );
    expect(database.executedStatements[1]).toBe('PRAGMA user_version = 1;');
    expect(database.executedStatements[2]).toContain(
      'CREATE TABLE active_child_selection',
    );
    expect(database.executedStatements[3]).toBe('PRAGMA user_version = 2;');
  });

  it('migrates version 1 to version 2 without selecting an existing child', async () => {
    const database = new FakeMigrationDatabase(1);

    await migrateLocalDatabase(database);

    expect(database.userVersion).toBe(2);
    expect(database.transactionCount).toBe(1);
    expect(database.executedStatements).toHaveLength(2);
    const schema = database.executedStatements[0];
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
    expect(database.executedStatements[1]).toBe('PRAGMA user_version = 2;');
  });

  it('does nothing when the database is already at version 2', async () => {
    const database = new FakeMigrationDatabase(2);

    await migrateLocalDatabase(database);

    expect(database.transactionCount).toBe(0);
    expect(database.executedStatements).toEqual([]);
  });

  it('rejects a schema version newer than the app supports', async () => {
    const database = new FakeMigrationDatabase(3);

    await expect(migrateLocalDatabase(database)).rejects.toMatchObject({
      code: 'unsupported-database-version',
    });
    expect(database.transactionCount).toBe(0);
  });

  it('rolls back a failed version 1 migration without advancing user_version', async () => {
    const database = new FakeMigrationDatabase(1, 'CREATE TABLE active_child_selection');

    const error = await migrateLocalDatabase(database).catch((reason: unknown) => reason);

    expect(database.userVersion).toBe(1);
    expect(database.committedTransactionCount).toBe(0);
    expect(database.rolledBackTransactionCount).toBe(1);
    expect(database.executedStatements).toHaveLength(1);
    expect(error).toMatchObject({ code: 'migration-failed' });
    expect(String(error)).not.toContain('sensitive details');
  });
});
