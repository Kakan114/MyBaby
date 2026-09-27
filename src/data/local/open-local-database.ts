import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDatabaseKey } from './database-key';
import { openEncryptedDatabase } from './encrypted-database';

export const LOCAL_DATABASE_NAME = 'mybaby.db';

export function openLocalDatabase(): Promise<SQLiteDatabase> {
  return openEncryptedDatabase({
    getDatabaseKey: getOrCreateDatabaseKey,
    openDatabase: () => openDatabaseAsync(LOCAL_DATABASE_NAME),
  });
}
