import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDatabaseKey } from './database-key';
import {
  openEncryptedDatabase,
  type EncryptedDatabaseConnection,
  type EncryptedDatabaseDependencies,
} from './encrypted-database';
import {
  LocalDatabaseMigrationError,
  migrateLocalDatabase,
  type LocalMigrationDatabase,
} from './migrations';

export const LOCAL_DATABASE_NAME = 'mybaby.db';

export interface LocalDatabaseConnection
  extends EncryptedDatabaseConnection,
    LocalMigrationDatabase {}

export type LocalDatabaseDependencies<TDatabase extends LocalDatabaseConnection> =
  EncryptedDatabaseDependencies<TDatabase> &
    Readonly<{
      migrateDatabase(database: TDatabase): Promise<void>;
    }>;

export async function initializeLocalDatabase<TDatabase extends LocalDatabaseConnection>(
  dependencies: LocalDatabaseDependencies<TDatabase>,
): Promise<TDatabase> {
  const database = await openEncryptedDatabase(dependencies);

  try {
    await dependencies.migrateDatabase(database);
    return database;
  } catch (error) {
    try {
      await database.closeAsync();
    } catch {
      // Preserve the migration failure without exposing native close details.
    }

    if (error instanceof LocalDatabaseMigrationError) {
      throw error;
    }

    throw new LocalDatabaseMigrationError('migration-failed');
  }
}

export function openLocalDatabase(): Promise<SQLiteDatabase> {
  return initializeLocalDatabase<SQLiteDatabase>({
    getDatabaseKey: getOrCreateDatabaseKey,
    openDatabase: () => openDatabaseAsync(LOCAL_DATABASE_NAME),
    migrateDatabase: migrateLocalDatabase,
  });
}
