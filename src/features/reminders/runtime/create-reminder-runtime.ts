import { getActiveChild, type ActiveChildDependencies } from '../../children/application/active-child';
import type { Child } from '../../children/domain/child';
import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';
import {
  checkReminderMutation,
  deleteReminder,
  readReminderById,
  readReminderList,
  recordReminder,
  ReminderApplicationError,
  updateReminder,
  type PendingReminderMutation,
  type ReminderIdGenerator,
  type ReminderMutationCheck,
  type ReminderValues,
} from '../application/reminder';
import type { ReminderCursor, ReminderPage, ReminderRepository } from '../application/reminder-repository';
import { ReminderValidationError, type Reminder } from '../domain/reminder';

export type ReminderSnapshot<T> = Readonly<{
  context: ActiveChildContext;
  child: Child;
  value: T;
}>;

export type CompletedReminderMutation = Readonly<{
  action: 'record' | 'update' | 'delete';
  reminder: Reminder;
}>;

export class ReminderRuntimeError extends Error {
  constructor(
    readonly code: 'active-child-required' | 'stale-child-context',
    readonly completedMutation?: CompletedReminderMutation,
  ) {
    super('The reminder child context is not available.');
    this.name = 'ReminderRuntimeError';
  }
}

export type ReminderRuntime = Readonly<{
  checkMutation(
    context: ActiveChildContext,
    pending: PendingReminderMutation,
  ): Promise<ReminderSnapshot<ReminderMutationCheck>>;
  getList(
    context?: ActiveChildContext,
    limit?: number,
    before?: ReminderCursor | null,
  ): Promise<ReminderSnapshot<ReminderPage>>;
  getById(context: ActiveChildContext, id: string): Promise<ReminderSnapshot<Reminder | null>>;
  record(context: ActiveChildContext, values: ReminderValues): Promise<ReminderSnapshot<Reminder>>;
  update(
    context: ActiveChildContext,
    expected: Reminder,
    values: ReminderValues,
  ): Promise<ReminderSnapshot<Reminder>>;
  delete(context: ActiveChildContext, expected: Reminder): Promise<ReminderSnapshot<null>>;
}>;

type Dependencies = Readonly<{
  runOperation<T>(operation: () => Promise<T>): Promise<T>;
  withDatabaseQueue<T>(operation: () => Promise<T>): Promise<T>;
  initialize(): Promise<ActiveChildDependencies & { reminderRepository: ReminderRepository }>;
  selection: ActiveChildSelection;
  idGenerator: ReminderIdGenerator;
  getCurrentEpochMs(): number;
}>;

export function createReminderRuntime(dependencies: Dependencies): ReminderRuntime {
  function run<T>(
    expected: ActiveChildContext | undefined,
    operation: (
      repository: ReminderRepository,
      child: Child,
      guard: () => void,
    ) => Promise<T>,
    completed?: (value: T) => CompletedReminderMutation | undefined,
    allowUnresolvedContext = false,
  ): Promise<ReminderSnapshot<T>> {
    const context = expected === undefined ? undefined : { ...expected };
    const version = dependencies.selection.getVersion();
    const wasChanging = dependencies.selection.isChanging();
    return dependencies.runOperation(async () => {
      try {
        const repositories = await dependencies.initialize();
        return await dependencies.withDatabaseQueue(async () => {
          const guard = () => {
            if (
              (!allowUnresolvedContext && context === undefined) || wasChanging ||
              dependencies.selection.isChanging() ||
              dependencies.selection.getVersion() !== version ||
              (context !== undefined && (
                context.selectionVersion !== version ||
                context.selectionScope !== dependencies.selection.scope
              ))
            ) {
              throw new ReminderRuntimeError('stale-child-context');
            }
          };
          guard();
          const child = await getActiveChild(repositories);
          guard();
          if (child === null) throw new ReminderRuntimeError('active-child-required');
          if (context !== undefined && context.childId !== child.id) {
            throw new ReminderRuntimeError('stale-child-context');
          }
          const value = await operation(repositories.reminderRepository, child, guard);
          try { guard(); }
          catch { throw new ReminderRuntimeError('stale-child-context', completed?.(value)); }
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
          error instanceof ReminderApplicationError ||
          error instanceof ReminderValidationError ||
          error instanceof ReminderRuntimeError
        ) throw error;
        throw new ReminderApplicationError('local-data-unavailable');
      }
    });
  }

  return {
    checkMutation(context, pending) {
      return run(context, (repository, child) => {
        if (pending.attempt.childId !== child.id) {
          throw new ReminderRuntimeError('stale-child-context');
        }
        return checkReminderMutation(repository, pending);
      }, (result) => result.status === 'success'
        ? { action: pending.action, reminder: pending.attempt }
        : undefined);
    },
    getList(context, limit = 20, before = null) {
      return run(context, (repository, child) => {
        if (before !== null && (context === undefined || before.childId !== child.id)) {
          throw new ReminderRuntimeError('stale-child-context');
        }
        return readReminderList(repository, child.id, limit, before);
      }, undefined, true);
    },
    getById(context, id) {
      return run(context, (repository, child) => readReminderById(repository, child.id, id));
    },
    record(context, values) {
      return run(
        context,
        (repository, child, guard) => recordReminder(
          repository,
          dependencies.idGenerator,
          child,
          dependencies.getCurrentEpochMs(),
          values,
          guard,
        ),
        (reminder) => ({ action: 'record', reminder }),
      );
    },
    update(context, expected, values) {
      return run(context, (repository, child, guard) => {
        if (expected.childId !== child.id) throw new ReminderRuntimeError('stale-child-context');
        return updateReminder(
          repository,
          child,
          dependencies.getCurrentEpochMs(),
          expected,
          values,
          guard,
        );
      }, (reminder) => ({ action: 'update', reminder }));
    },
    delete(context, expected) {
      return run(context, async (repository, child, guard) => {
        if (expected.childId !== child.id) throw new ReminderRuntimeError('stale-child-context');
        await deleteReminder(repository, child, expected, guard);
        return null;
      }, () => ({ action: 'delete', reminder: expected }));
    },
  };
}
