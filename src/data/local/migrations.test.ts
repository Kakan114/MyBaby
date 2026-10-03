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
  it('migrates version 0 to version 1 transactionally', async () => {
    const database = new FakeMigrationDatabase(0);

    await migrateLocalDatabase(database);

    expect(database.userVersion).toBe(LATEST_LOCAL_DATABASE_VERSION);
    expect(database.transactionCount).toBe(1);
    expect(database.committedTransactionCount).toBe(1);
    expect(database.rolledBackTransactionCount).toBe(0);
    expect(database.executedStatements).toHaveLength(2);
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
  });

  it('does nothing when the database is already at version 1', async () => {
    const database = new FakeMigrationDatabase(1);

    await migrateLocalDatabase(database);

    expect(database.transactionCount).toBe(0);
    expect(database.executedStatements).toEqual([]);
  });

  it('rejects a schema version newer than the app supports', async () => {
    const database = new FakeMigrationDatabase(2);

    await expect(migrateLocalDatabase(database)).rejects.toMatchObject({
      code: 'unsupported-database-version',
    });
    expect(database.transactionCount).toBe(0);
  });

  it('rolls back a failed migration without advancing user_version', async () => {
    const database = new FakeMigrationDatabase(0, 'CREATE TABLE children');

    const error = await migrateLocalDatabase(database).catch((reason: unknown) => reason);

    expect(database.userVersion).toBe(0);
    expect(database.committedTransactionCount).toBe(0);
    expect(database.rolledBackTransactionCount).toBe(1);
    expect(database.executedStatements).toHaveLength(1);
    expect(error).toMatchObject({ code: 'migration-failed' });
    expect(String(error)).not.toContain('sensitive details');
  });
});
