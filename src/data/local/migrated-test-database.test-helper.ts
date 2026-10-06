import { DatabaseSync } from 'node:sqlite';

import { migrateLocalDatabase } from './migrations';

export async function createMigratedTestDatabase(): Promise<DatabaseSync> {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');

  await migrateLocalDatabase({
    async execAsync(source) {
      database.exec(source);
    },
    async getFirstAsync<T>(source: string): Promise<T | null> {
      return (database.prepare(source).get() as T | undefined) ?? null;
    },
  });

  return database;
}
