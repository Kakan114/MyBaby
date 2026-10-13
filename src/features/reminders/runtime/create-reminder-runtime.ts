import { getActiveChild, type ActiveChildDependencies } from '../../children/application/active-child';
import type { Child } from '../../children/domain/child';
import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';
import {
  checkReminderMutation,
  deleteReminder,
  readReminderById,
  readReminderList,
  readPastReminders,
  readUpcomingReminders,
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

const reminderListCursorBrand: unique symbol = Symbol('ReminderListCursor');

/** Opaque, runtime-issued cursor. Its child and captured clock boundary are not presentation input. */
export type ReminderListCursor = Readonly<{
  [reminderListCursorBrand]: true;
}>;

export type ReminderListPage = Readonly<{
  items: readonly Reminder[];
  nextCursor: ReminderListCursor | null;
}>;

export class ReminderRuntimeError extends Error {
  constructor(
    readonly code: 'active-child-required' | 'stale-child-context' | 'invalid-pagination-cursor',
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
  getUpcoming(
    limit?: number,
    cursor?: ReminderListCursor | null,
  ): Promise<ReminderSnapshot<ReminderListPage>>;
  getPast(
    limit?: number,
    cursor?: ReminderListCursor | null,
  ): Promise<ReminderSnapshot<ReminderListPage>>;
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
  type ListMode = 'upcoming' | 'past';
  type CursorState = Readonly<{
    mode: ListMode;
    context: ActiveChildContext;
    boundaryEpochMs: number;
    repositoryCursor: ReminderCursor;
  }>;
  const cursorStates = new WeakMap<object, CursorState>();

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

  function readCursor(
    cursor: ReminderListCursor | null,
    mode: ListMode,
  ): CursorState | null {
    if (cursor === null) return null;
    if (typeof cursor !== 'object') {
      throw new ReminderRuntimeError('invalid-pagination-cursor');
    }
    const state = cursorStates.get(cursor);
    if (state === undefined || state.mode !== mode) {
      throw new ReminderRuntimeError('invalid-pagination-cursor');
    }
    return state;
  }

  function issueCursor(state: CursorState): ReminderListCursor {
    const cursor = Object.freeze({ [reminderListCursorBrand]: true as const });
    cursorStates.set(cursor, state);
    return cursor;
  }

  async function getBoundedList(
    mode: ListMode,
    limit: number,
    cursor: ReminderListCursor | null,
  ): Promise<ReminderSnapshot<ReminderListPage>> {
    const cursorState = readCursor(cursor, mode);
    const snapshot = await run(
      cursorState?.context,
      async (repository, child) => {
        const boundaryEpochMs = cursorState?.boundaryEpochMs ?? dependencies.getCurrentEpochMs();
        const page = mode === 'upcoming'
          ? await readUpcomingReminders(
              repository,
              child.id,
              boundaryEpochMs,
              limit,
              cursorState?.repositoryCursor,
            )
          : await readPastReminders(
              repository,
              child.id,
              boundaryEpochMs,
              limit,
              cursorState?.repositoryCursor,
            );
        return { boundaryEpochMs, page };
      },
      undefined,
      true,
    );
    const nextRepositoryCursor = snapshot.value.page.nextCursor;
    return {
      context: snapshot.context,
      child: snapshot.child,
      value: {
        items: snapshot.value.page.items,
        nextCursor: nextRepositoryCursor === null
          ? null
          : issueCursor({
              mode,
              context: snapshot.context,
              boundaryEpochMs: snapshot.value.boundaryEpochMs,
              repositoryCursor: nextRepositoryCursor,
            }),
      },
    };
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
    getUpcoming(limit = 20, cursor = null) {
      return getBoundedList('upcoming', limit, cursor);
    },
    getPast(limit = 20, cursor = null) {
      return getBoundedList('past', limit, cursor);
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
