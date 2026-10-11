import { SqliteGrowthRepository } from '../features/growth/data/sqlite-growth-repository';
import { ExpoGrowthIdGenerator } from '../features/growth/data/expo-growth-id-generator';
import { SqliteMilestoneRepository } from '../features/milestones/data/sqlite-milestone-repository';
import { ExpoMilestoneIdGenerator } from '../features/milestones/data/expo-milestone-id-generator';
import { SqliteReminderRepository } from '../features/reminders/data/sqlite-reminder-repository';
import { ExpoReminderIdGenerator } from '../features/reminders/data/expo-reminder-id-generator';
import {
  ExpoReminderNotificationService,
  registerReminderNotificationForegroundHandler,
} from '../services/notifications/expo-reminder-notification-service';
import { getLocalDayContext } from '../features/today/data/local-day-context';
import { openLocalDatabase } from '../data/local/open-local-database';
import { ExpoChildIdGenerator } from '../features/children/data/expo-child-id-generator';
import { getCurrentLocalCalendarDate } from '../features/children/data/local-calendar-date';
import { SqliteActiveChildRepository } from '../features/children/data/sqlite-active-child-repository';
import { SqliteChildRepository } from '../features/children/data/sqlite-child-repository';
import { ExpoFeedingIdGenerator } from '../features/feeding/data/expo-feeding-id-generator';
import { SqliteFeedingRepository } from '../features/feeding/data/sqlite-feeding-repository';
import { SqliteBreastfeedingTimerRepository } from '../features/feeding/data/sqlite-breastfeeding-timer-repository';
import { ExpoSleepIdGenerator } from '../features/sleep/data/expo-sleep-id-generator';
import { SqliteSleepRepository } from '../features/sleep/data/sqlite-sleep-repository';
import { ExpoDiaperIdGenerator } from '../features/diapers/data/expo-diaper-id-generator';
import { SqliteDiaperRepository } from '../features/diapers/data/sqlite-diaper-repository';

import { createAppRuntime, type AppRuntime } from './app-runtime';

registerReminderNotificationForegroundHandler();

export function createProductionAppRuntime(): AppRuntime {
  return createAppRuntime({
    openDatabase: openLocalDatabase,
    createActiveChildRepository: (database) =>
      new SqliteActiveChildRepository(database),
    createChildRepository: (database) => new SqliteChildRepository(database),
    createFeedingRepository: (database) => new SqliteFeedingRepository(database),
    createBreastfeedingTimerRepository: (database) =>
      new SqliteBreastfeedingTimerRepository(database),
    createSleepRepository: (database) => new SqliteSleepRepository(database),
    createGrowthRepository: (database) => new SqliteGrowthRepository(database),
    createMilestoneRepository: (database) => new SqliteMilestoneRepository(database),
    createReminderRepository: (database) => new SqliteReminderRepository(database),
    reminderNotificationService: new ExpoReminderNotificationService(),
    createDiaperRepository: (database) => new SqliteDiaperRepository(database),
    childIdGenerator: new ExpoChildIdGenerator(),
    feedingIdGenerator: new ExpoFeedingIdGenerator(),
    sleepIdGenerator: new ExpoSleepIdGenerator(),
    growthIdGenerator: new ExpoGrowthIdGenerator(),
    milestoneIdGenerator: new ExpoMilestoneIdGenerator(),
    reminderIdGenerator: new ExpoReminderIdGenerator(),
    diaperIdGenerator: new ExpoDiaperIdGenerator(),
    getCurrentCalendarDate: getCurrentLocalCalendarDate,
    getCurrentEpochMs: Date.now,
    getLocalDayContext,
    createTodayReadRepositories: (database) => ({
      feeding: new SqliteFeedingRepository(database),
      diapers: new SqliteDiaperRepository(database),
      sleep: new SqliteSleepRepository(database),
    }),
  });
}
