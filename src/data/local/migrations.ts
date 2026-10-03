export const LATEST_LOCAL_DATABASE_VERSION = 1;

export interface LocalMigrationTransaction {
  execAsync(source: string): Promise<void>;
}

export interface LocalMigrationDatabase {
  getFirstAsync<T>(source: string): Promise<T | null>;
  withExclusiveTransactionAsync(
    task: (transaction: LocalMigrationTransaction) => Promise<void>,
  ): Promise<void>;
}

export type LocalDatabaseMigrationErrorCode =
  | 'migration-failed'
  | 'unsupported-database-version';

export class LocalDatabaseMigrationError extends Error {
  constructor(readonly code: LocalDatabaseMigrationErrorCode) {
    super(
      code === 'unsupported-database-version'
        ? 'The local database schema is newer than this app supports.'
        : 'Unable to initialize the local database schema.',
    );
    this.name = 'LocalDatabaseMigrationError';
  }
}

type UserVersionRow = { user_version: number };
type Migration = (transaction: LocalMigrationTransaction) => Promise<void>;

const migrations: readonly Migration[] = [
  async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE children (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
        date_of_birth TEXT NOT NULL
          CHECK (
            length(date_of_birth) = 10
            AND date_of_birth GLOB
              '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          )
      );
    `);
  },
];

async function readUserVersion(database: LocalMigrationDatabase): Promise<number> {
  try {
    const row = await database.getFirstAsync<UserVersionRow>('PRAGMA user_version;');
    const version = row?.user_version;

    if (!Number.isInteger(version) || version === undefined || version < 0) {
      throw new Error('Invalid user_version.');
    }

    return version;
  } catch {
    throw new LocalDatabaseMigrationError('migration-failed');
  }
}

export async function migrateLocalDatabase(database: LocalMigrationDatabase): Promise<void> {
  let currentVersion = await readUserVersion(database);

  if (currentVersion > LATEST_LOCAL_DATABASE_VERSION) {
    throw new LocalDatabaseMigrationError('unsupported-database-version');
  }

  while (currentVersion < LATEST_LOCAL_DATABASE_VERSION) {
    const migration = migrations[currentVersion];
    const nextVersion = currentVersion + 1;

    if (!migration) {
      throw new LocalDatabaseMigrationError('migration-failed');
    }

    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await migration(transaction);
        await transaction.execAsync(`PRAGMA user_version = ${nextVersion};`);
      });
    } catch {
      throw new LocalDatabaseMigrationError('migration-failed');
    }

    currentVersion = nextVersion;
  }
}
