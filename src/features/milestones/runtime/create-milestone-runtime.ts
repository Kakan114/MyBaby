import { getActiveChild, type ActiveChildDependencies } from '../../children/application/active-child';
import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';
import type { Child } from '../../children/domain/child';
import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';
import {
  checkMilestoneMutation,
  deleteMilestone,
  MilestoneApplicationError,
  readMilestoneById,
  readMilestoneHistory,
  recordMilestone,
  updateMilestone,
  type MilestoneIdGenerator,
  type MilestoneMutationCheck,
  type MilestoneValues,
  type PendingMilestoneMutation,
} from '../application/milestone';
import type {
  MilestoneHistoryCursor,
  MilestoneHistoryPage,
  MilestoneRepository,
} from '../application/milestone-repository';
import {
  MilestoneValidationError,
  type MilestoneEntry,
} from '../domain/milestone-entry';

export type MilestoneSnapshot<T> = Readonly<{
  context: ActiveChildContext;
  child: Child;
  value: T;
}>;

export type CompletedMilestoneMutation = Readonly<{
  action: 'record' | 'update' | 'delete';
  entry: MilestoneEntry;
}>;

export class MilestoneRuntimeError extends Error {
  constructor(
    readonly code: 'active-child-required' | 'stale-child-context',
    readonly completedMutation?: CompletedMilestoneMutation,
  ) {
    super('The milestone child context is not available.');
    this.name = 'MilestoneRuntimeError';
  }
}

export type MilestoneRuntime = Readonly<{
  checkMutation(
    context: ActiveChildContext,
    pending: PendingMilestoneMutation,
  ): Promise<MilestoneSnapshot<MilestoneMutationCheck>>;
  getHistory(
    context?: ActiveChildContext,
    limit?: number,
    before?: MilestoneHistoryCursor | null,
  ): Promise<MilestoneSnapshot<MilestoneHistoryPage>>;
  getById(
    context: ActiveChildContext,
    id: string,
  ): Promise<MilestoneSnapshot<MilestoneEntry | null>>;
  record(
    context: ActiveChildContext,
    values: MilestoneValues,
  ): Promise<MilestoneSnapshot<MilestoneEntry>>;
  update(
    context: ActiveChildContext,
    expected: MilestoneEntry,
    values: MilestoneValues,
  ): Promise<MilestoneSnapshot<MilestoneEntry>>;
  delete(
    context: ActiveChildContext,
    expected: MilestoneEntry,
  ): Promise<MilestoneSnapshot<null>>;
}>;

type Dependencies = Readonly<{
  runOperation<T>(operation: () => Promise<T>): Promise<T>;
  withDatabaseQueue<T>(operation: () => Promise<T>): Promise<T>;
  initialize(): Promise<ActiveChildDependencies & { milestoneRepository: MilestoneRepository }>;
  selection: ActiveChildSelection;
  idGenerator: MilestoneIdGenerator;
  getCurrentCalendarDate(): CalendarDate;
}>;

export function createMilestoneRuntime(dependencies: Dependencies): MilestoneRuntime {
  function run<T>(
    expected: ActiveChildContext | undefined,
    operation: (
      repository: MilestoneRepository,
      child: Child,
      guard: () => void,
    ) => Promise<T>,
    completed?: (value: T) => CompletedMilestoneMutation | undefined,
    allowUnresolvedContext = false,
  ): Promise<MilestoneSnapshot<T>> {
    const context = expected === undefined ? undefined : { ...expected };
    const version = dependencies.selection.getVersion();
    const wasChanging = dependencies.selection.isChanging();
    return dependencies.runOperation(async () => {
      try {
        const repositories = await dependencies.initialize();
        return await dependencies.withDatabaseQueue(async () => {
          const guard = () => {
            if (
              (!allowUnresolvedContext && context === undefined) ||
              wasChanging || dependencies.selection.isChanging() ||
              dependencies.selection.getVersion() !== version ||
              (context !== undefined && (
                context.selectionVersion !== version ||
                context.selectionScope !== dependencies.selection.scope
              ))
            ) {
              throw new MilestoneRuntimeError('stale-child-context');
            }
          };
          guard();
          const child = await getActiveChild(repositories);
          guard();
          if (child === null) throw new MilestoneRuntimeError('active-child-required');
          if (context !== undefined && context.childId !== child.id) {
            throw new MilestoneRuntimeError('stale-child-context');
          }
          const value = await operation(repositories.milestoneRepository, child, guard);
          try { guard(); }
          catch { throw new MilestoneRuntimeError('stale-child-context', completed?.(value)); }
          return {
            context: Object.freeze({
              childId: child.id,
              selectionVersion: version,
              selectionScope: dependencies.selection.scope,
            }),
            child,
            value,
          };
        });
      } catch (error) {
        if (
          error instanceof MilestoneApplicationError ||
          error instanceof MilestoneValidationError ||
          error instanceof MilestoneRuntimeError
        ) throw error;
        throw new MilestoneApplicationError('local-data-unavailable');
      }
    });
  }

  function today(): CalendarDate {
    return createCalendarDate(dependencies.getCurrentCalendarDate());
  }

  return {
    checkMutation(context, pending) {
      return run(context, (repository, child) => {
        if (pending.attempt.childId !== child.id) {
          throw new MilestoneRuntimeError('stale-child-context');
        }
        return checkMilestoneMutation(repository, pending);
      }, (result) => result.status === 'success'
        ? { action: pending.action, entry: pending.attempt }
        : undefined);
    },
    getHistory(context, limit = 20, before = null) {
      return run(context, (repository, child) => {
        if (before !== null && (context === undefined || before.childId !== child.id)) {
          throw new MilestoneRuntimeError('stale-child-context');
        }
        return readMilestoneHistory(repository, child.id, limit, before);
      }, undefined, true);
    },
    getById(context, id) {
      return run(context, (repository, child) => readMilestoneById(repository, child.id, id));
    },
    record(context, values) {
      return run(
        context,
        (repository, child, guard) => recordMilestone(
          repository,
          dependencies.idGenerator,
          child,
          today(),
          values,
          guard,
        ),
        (entry) => ({ action: 'record', entry }),
      );
    },
    update(context, expected, values) {
      return run(context, (repository, child, guard) => {
        if (expected.childId !== child.id) {
          throw new MilestoneRuntimeError('stale-child-context');
        }
        return updateMilestone(repository, child, today(), expected, values, guard);
      }, (entry) => ({ action: 'update', entry }));
    },
    delete(context, expected) {
      return run(context, async (repository, child, guard) => {
        if (expected.childId !== child.id) {
          throw new MilestoneRuntimeError('stale-child-context');
        }
        await deleteMilestone(repository, child, expected, guard);
        return null;
      }, () => ({ action: 'delete', entry: expected }));
    },
  };
}

