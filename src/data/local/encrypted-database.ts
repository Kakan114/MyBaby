import type { DatabaseKey } from './database-key';

const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/;

export interface EncryptedDatabaseConnection {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  closeAsync(): Promise<void>;
}

export type EncryptedDatabaseDependencies<TDatabase extends EncryptedDatabaseConnection> = Readonly<{
  getDatabaseKey(): Promise<DatabaseKey>;
  openDatabase(): Promise<TDatabase>;
}>;

export type LocalDatabaseErrorCode = 'database-open-failed' | 'database-unlock-failed';

export class LocalDatabaseError extends Error {
  constructor(readonly code: LocalDatabaseErrorCode) {
    super(
      code === 'database-open-failed'
        ? 'Unable to open the local database.'
        : 'Unable to unlock or initialize the local database.',
    );
    this.name = 'LocalDatabaseError';
  }
}

export function createSqlCipherKeyPragma(key: string): string {
  if (!DATABASE_KEY_PATTERN.test(key)) {
    throw new LocalDatabaseError('database-unlock-failed');
  }

  return `PRAGMA key = "x'${key}'";`;
}

export async function openEncryptedDatabase<TDatabase extends EncryptedDatabaseConnection>(
  dependencies: EncryptedDatabaseDependencies<TDatabase>,
): Promise<TDatabase> {
  const key = await dependencies.getDatabaseKey();
  let database: TDatabase;

  try {
    database = await dependencies.openDatabase();
  } catch {
    throw new LocalDatabaseError('database-open-failed');
  }

  try {
    await database.execAsync(createSqlCipherKeyPragma(key));
    await database.getFirstAsync<{ count: number }>(
      'SELECT count(*) AS count FROM sqlite_master;',
    );
    await database.execAsync('PRAGMA foreign_keys = ON;');
  } catch {
    try {
      await database.closeAsync();
    } catch {
      // Preserve the original initialization failure without exposing native error details.
    }

    throw new LocalDatabaseError('database-unlock-failed');
  }

  return database;
}
