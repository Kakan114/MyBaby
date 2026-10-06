export const LATEST_LOCAL_DATABASE_VERSION = 3;

export interface LocalMigrationTransaction {
  execAsync(source: string): Promise<void>;
}

export interface LocalMigrationDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
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
  async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE active_child_selection (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        child_id TEXT NOT NULL,
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      );
    `);
  },
  async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE feeding_events (
        id TEXT PRIMARY KEY NOT NULL,
        child_id TEXT NOT NULL,
        occurred_at_epoch_ms INTEGER NOT NULL
          CHECK (typeof(occurred_at_epoch_ms) = 'integer' AND occurred_at_epoch_ms >= 0),
        kind TEXT NOT NULL CHECK (kind IN ('breast', 'bottle')),
        left_duration_seconds INTEGER,
        right_duration_seconds INTEGER,
        amount_tenths_ml INTEGER,
        contents TEXT,
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
        CHECK (
          (
            kind = 'breast'
            AND left_duration_seconds IS NOT NULL
            AND typeof(left_duration_seconds) = 'integer'
            AND left_duration_seconds >= 0
            AND right_duration_seconds IS NOT NULL
            AND typeof(right_duration_seconds) = 'integer'
            AND right_duration_seconds >= 0
            AND left_duration_seconds + right_duration_seconds > 0
            AND amount_tenths_ml IS NULL
            AND contents IS NULL
          )
          OR
          (
            kind = 'bottle'
            AND left_duration_seconds IS NULL
            AND right_duration_seconds IS NULL
            AND amount_tenths_ml IS NOT NULL
            AND typeof(amount_tenths_ml) = 'integer'
            AND amount_tenths_ml > 0
            AND contents IS NOT NULL
            AND contents IN ('expressed-breast-milk', 'formula', 'mixed')
          )
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

    let transactionStarted = false;

    try {
      await database.execAsync('BEGIN IMMEDIATE;');
      transactionStarted = true;
      await migration(database);
      await database.execAsync(`PRAGMA user_version = ${nextVersion};`);
      await database.execAsync('COMMIT;');
    } catch {
      if (transactionStarted) {
        try {
          await database.execAsync('ROLLBACK;');
        } catch {
          // Preserve the migration failure; initialization will close the connection.
        }
      }

      throw new LocalDatabaseMigrationError('migration-failed');
    }

    currentVersion = nextVersion;
  }
}
