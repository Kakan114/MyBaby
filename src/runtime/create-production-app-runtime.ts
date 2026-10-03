import { openLocalDatabase } from '../data/local/open-local-database';
import { ExpoChildIdGenerator } from '../features/children/data/expo-child-id-generator';
import { SqliteActiveChildRepository } from '../features/children/data/sqlite-active-child-repository';
import { SqliteChildRepository } from '../features/children/data/sqlite-child-repository';

import { createAppRuntime, type AppRuntime } from './app-runtime';

export function createProductionAppRuntime(): AppRuntime {
  return createAppRuntime({
    openDatabase: openLocalDatabase,
    createActiveChildRepository: (database) =>
      new SqliteActiveChildRepository(database),
    createChildRepository: (database) => new SqliteChildRepository(database),
    childIdGenerator: new ExpoChildIdGenerator(),
  });
}
