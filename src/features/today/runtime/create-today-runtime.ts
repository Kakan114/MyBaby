import type { ActiveChildDependencies } from '../../children/application/active-child';
import { getTodaySummary, type TodayReadRepositories } from '../application/get-today-summary';
import type { LocalDayContext, TodaySummaryResult } from '../application/today-summary';

export type TodayRuntime = Readonly<{ getSummary(): Promise<TodaySummaryResult>; subscribeSelectionChange?(listener: (switching: boolean) => void): () => void }>;

type Dependencies = Readonly<{
  runOperation<T>(operation: () => Promise<T>): Promise<T>;
  withDatabaseQueue<T>(operation: () => Promise<T>): Promise<T>;
  initialize(): Promise<ActiveChildDependencies & TodayReadRepositories>;
  readEpochClock(): number;
  getLocalDayContext(nowEpochMs: number): LocalDayContext;
  localDataError(): Error;
  subscribeSelectionChange?(listener: (switching: boolean) => void): () => void;
}>;

export function createTodayRuntime(dependencies: Dependencies): TodayRuntime {
  return {
    subscribeSelectionChange: dependencies.subscribeSelectionChange,
    getSummary() {
      return dependencies.runOperation(async () => {
        try {
          // Initialize before queue wait so an accepted operation can finish during close().
          const repositories = await dependencies.initialize();
          return await dependencies.withDatabaseQueue(async () => {
            const nowEpochMs = dependencies.readEpochClock();
            const day = dependencies.getLocalDayContext(nowEpochMs);
            return getTodaySummary(repositories, nowEpochMs, day);
          });
        } catch {
          throw dependencies.localDataError();
        }
      });
    },
  };
}
