import { openLocalDatabase } from '../data/local/open-local-database';
import { ExpoChildIdGenerator } from '../features/children/data/expo-child-id-generator';
import { getCurrentLocalCalendarDate } from '../features/children/data/local-calendar-date';
import { SqliteActiveChildRepository } from '../features/children/data/sqlite-active-child-repository';
import { SqliteChildRepository } from '../features/children/data/sqlite-child-repository';
import { ExpoFeedingIdGenerator } from '../features/feeding/data/expo-feeding-id-generator';
import { SqliteFeedingRepository } from '../features/feeding/data/sqlite-feeding-repository';
import { SqliteBreastfeedingTimerRepository } from '../features/feeding/data/sqlite-breastfeeding-timer-repository';

import { createAppRuntime, type AppRuntime } from './app-runtime';

export function createProductionAppRuntime(): AppRuntime {
  return createAppRuntime({
    openDatabase: openLocalDatabase,
    createActiveChildRepository: (database) =>
      new SqliteActiveChildRepository(database),
    createChildRepository: (database) => new SqliteChildRepository(database),
    createFeedingRepository: (database) => new SqliteFeedingRepository(database),
    createBreastfeedingTimerRepository: (database) =>
      new SqliteBreastfeedingTimerRepository(database),
    childIdGenerator: new ExpoChildIdGenerator(),
    feedingIdGenerator: new ExpoFeedingIdGenerator(),
    getCurrentCalendarDate: getCurrentLocalCalendarDate,
    getCurrentEpochMs: Date.now,
  });
}
