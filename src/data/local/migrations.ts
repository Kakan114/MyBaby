export const LATEST_LOCAL_DATABASE_VERSION = 6;

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
  async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE breastfeeding_timer_session (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        session_id TEXT NOT NULL UNIQUE CHECK (length(trim(session_id)) > 0),
        child_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('running', 'paused', 'finished')),
        accumulated_left_ms INTEGER NOT NULL
          CHECK (
            typeof(accumulated_left_ms) = 'integer'
            AND accumulated_left_ms >= 0
            AND accumulated_left_ms <= 9007199254740991
          ),
        accumulated_right_ms INTEGER NOT NULL
          CHECK (
            typeof(accumulated_right_ms) = 'integer'
            AND accumulated_right_ms >= 0
            AND accumulated_right_ms <= 9007199254740991
          ),
        active_side TEXT,
        resume_side TEXT,
        segment_started_at_epoch_ms INTEGER,
        finished_at_epoch_ms INTEGER,
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
        CHECK (
          (
            state = 'running'
            AND active_side IS NOT NULL
            AND active_side IN ('left', 'right')
            AND resume_side IS NULL
            AND segment_started_at_epoch_ms IS NOT NULL
            AND typeof(segment_started_at_epoch_ms) = 'integer'
            AND segment_started_at_epoch_ms >= 0
            AND segment_started_at_epoch_ms <= 9007199254740991
            AND finished_at_epoch_ms IS NULL
          )
          OR
          (
            state = 'paused'
            AND active_side IS NULL
            AND resume_side IS NOT NULL
            AND resume_side IN ('left', 'right')
            AND segment_started_at_epoch_ms IS NULL
            AND finished_at_epoch_ms IS NULL
          )
          OR
          (
            state = 'finished'
            AND active_side IS NULL
            AND resume_side IS NULL
            AND segment_started_at_epoch_ms IS NULL
            AND finished_at_epoch_ms IS NOT NULL
            AND typeof(finished_at_epoch_ms) = 'integer'
            AND finished_at_epoch_ms >= 0
            AND finished_at_epoch_ms <= 9007199254740991
          )
        )
      );
    `);
  },
  async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE sleep_events (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        child_id TEXT NOT NULL,
        started_at_epoch_ms INTEGER NOT NULL
          CHECK (
            typeof(started_at_epoch_ms) = 'integer'
            AND started_at_epoch_ms >= 0
            AND started_at_epoch_ms <= 8640000000000000
          ),
        ended_at_epoch_ms INTEGER NOT NULL
          CHECK (
            typeof(ended_at_epoch_ms) = 'integer'
            AND ended_at_epoch_ms > started_at_epoch_ms
            AND ended_at_epoch_ms <= 8640000000000000
          ),
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      );

      CREATE TABLE active_sleep_sessions (
        child_id TEXT PRIMARY KEY NOT NULL,
        id TEXT NOT NULL UNIQUE CHECK (length(trim(id)) > 0),
        started_at_epoch_ms INTEGER NOT NULL
          CHECK (
            typeof(started_at_epoch_ms) = 'integer'
            AND started_at_epoch_ms >= 0
            AND started_at_epoch_ms <= 8640000000000000
          ),
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      );
    `);
  },
  async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE diaper_events (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
        child_id TEXT NOT NULL CHECK (length(trim(child_id)) > 0),
        occurred_at_epoch_ms INTEGER NOT NULL
          CHECK (
            typeof(occurred_at_epoch_ms) = 'integer'
            AND occurred_at_epoch_ms >= 0
            AND occurred_at_epoch_ms <= 8640000000000000
          ),
        kind TEXT NOT NULL CHECK (kind IN ('wet', 'dirty', 'mixed')),
        FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
      );

      CREATE INDEX diaper_events_child_occurred_id_idx
        ON diaper_events (child_id, occurred_at_epoch_ms DESC, id DESC);
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
