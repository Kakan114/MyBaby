import { getActiveChild, type ActiveChildDependencies } from '../../children/application/active-child';
import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';
import type { Child } from '../../children/domain/child';
import { GrowthApplicationError, checkGrowthMutation, type PendingGrowthMutation, type GrowthMutationCheck, recordGrowth, readGrowthById, readGrowthHistory, updateGrowth, deleteGrowth,
  type GrowthIdGenerator, type GrowthValues } from '../application/growth';
import type { GrowthHistoryCursor, GrowthHistoryPage, GrowthRepository } from '../application/growth-repository';
import { GrowthValidationError, type GrowthMeasurement } from '../domain/growth-measurement';
import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';

export type GrowthSnapshot<T> = Readonly<{ context: ActiveChildContext; child: Child; value: T }>;
export type CompletedGrowthMutation = Readonly<{
  action: 'record' | 'update' | 'delete'; measurement: GrowthMeasurement;
}>;
export class GrowthRuntimeError extends Error {
  constructor(
    readonly code: 'active-child-required' | 'stale-child-context',
    // A switch after a committed mutation must not turn a known success into an unknown outcome.
    readonly completedMutation?: CompletedGrowthMutation,
  ) {
    super('The growth child context is not available.');
    this.name = 'GrowthRuntimeError';
  }
}
export type GrowthRuntime = Readonly<{
  checkMutation(context: ActiveChildContext, pending: PendingGrowthMutation): Promise<GrowthSnapshot<GrowthMutationCheck>>;
  getHistory(context?: ActiveChildContext, limit?: number, before?: GrowthHistoryCursor | null): Promise<GrowthSnapshot<GrowthHistoryPage>>;
  getById(context: ActiveChildContext, id: string): Promise<GrowthSnapshot<GrowthMeasurement | null>>;
  record(context: ActiveChildContext, values: GrowthValues): Promise<GrowthSnapshot<GrowthMeasurement>>;
  update(context: ActiveChildContext, expected: GrowthMeasurement, values: GrowthValues): Promise<GrowthSnapshot<GrowthMeasurement>>;
  delete(context: ActiveChildContext, expected: GrowthMeasurement): Promise<GrowthSnapshot<null>>;
}>;
type Dependencies = Readonly<{
  runOperation<T>(operation: () => Promise<T>): Promise<T>;
  withDatabaseQueue<T>(operation: () => Promise<T>): Promise<T>;
  initialize(): Promise<ActiveChildDependencies & { growthRepository: GrowthRepository }>;
  selection: ActiveChildSelection;
  idGenerator: GrowthIdGenerator;
  getCurrentCalendarDate(): CalendarDate;
}>;

export function createGrowthRuntime(dependencies: Dependencies): GrowthRuntime {
  function run<T>(
    expected: ActiveChildContext | undefined,
    operation: (repository: GrowthRepository, child: Child, guard: () => void) => Promise<T>,
    completed?: (value: T) => CompletedGrowthMutation | undefined,
    allowUnresolvedContext = false,
  ): Promise<GrowthSnapshot<T>> {
    // Capture selection intent at invocation, including switches while waiting for the queue.
    const context = expected === undefined ? undefined : { ...expected };
    const version = dependencies.selection.getVersion();
    const wasChanging = dependencies.selection.isChanging();
    return dependencies.runOperation(async () => {
      try {
        const repositories = await dependencies.initialize();
        return await dependencies.withDatabaseQueue(async () => {
          const guard = () => {
            if ((!allowUnresolvedContext && context === undefined) || wasChanging || dependencies.selection.isChanging() ||
                dependencies.selection.getVersion() !== version ||
                (context !== undefined && (context.selectionVersion !== version || context.selectionScope !== dependencies.selection.scope))) {
              throw new GrowthRuntimeError('stale-child-context');
            }
          };
          guard();
          const child = await getActiveChild(repositories);
          guard();
          if (child === null) throw new GrowthRuntimeError('active-child-required');
          if (context !== undefined && context.childId !== child.id) throw new GrowthRuntimeError('stale-child-context');
          const value = await operation(repositories.growthRepository, child, guard);
          try { guard(); }
          catch {
            throw new GrowthRuntimeError('stale-child-context', completed?.(value));
          }
          return { context: Object.freeze({ childId: child.id, selectionVersion: version, selectionScope: dependencies.selection.scope }), child, value };
        });
      } catch (error) {
        if (error instanceof GrowthApplicationError || error instanceof GrowthValidationError || error instanceof GrowthRuntimeError) throw error;
        throw new GrowthApplicationError('local-data-unavailable');
      }
    });
  }
  function today(): CalendarDate {
    return createCalendarDate(dependencies.getCurrentCalendarDate());
  }
  return {
    checkMutation(context, pending) {
      return run(context, (repository, child) => {
        if (pending.attempt.childId !== child.id) throw new GrowthRuntimeError('stale-child-context');
        return checkGrowthMutation(repository, pending);
      }, result => result.status === 'success' ? { action: pending.action, measurement: pending.attempt } : undefined);
    },
    getHistory(context, limit = 20, before = null) {
      return run(context, (repository, child) => {
        if (before !== null && (context === undefined || before.childId !== child.id)) {
          throw new GrowthRuntimeError('stale-child-context');
        }
        return readGrowthHistory(repository, child.id, limit, before);
      }, undefined, true);
    },
    getById(context, id) {
      return run(context, (repository, child) => readGrowthById(repository, child.id, id));
    },
    record(context, values) {
      return run(context, (repository, child, guard) =>
        recordGrowth(repository, dependencies.idGenerator, child, today(), values, guard),
      measurement => ({ action: 'record', measurement }));
    },
    update(context, expected, values) {
      return run(context, (repository, child, guard) => {
        if (expected.childId !== child.id) throw new GrowthRuntimeError('stale-child-context');
        return updateGrowth(repository, child, today(), expected, values, guard);
      }, measurement => ({ action: 'update', measurement }));
    },
    delete(context, expected) {
      return run(context, async (repository, child, guard) => {
        if (expected.childId !== child.id) throw new GrowthRuntimeError('stale-child-context');
        await deleteGrowth(repository, child, expected, guard);
        return null;
      }, () => ({ action: 'delete', measurement: expected }));
    },
  };
}
