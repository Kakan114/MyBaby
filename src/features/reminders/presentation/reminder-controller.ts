import type { ReminderNotificationsRuntime } from '../../../runtime/app-runtime';
import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';
import type { ReminderNotificationPermissionStatus } from '../../../services/notifications/reminder-notification-service';
import type { ReminderNotificationReconciliationResult } from '../../../services/notifications/reminder-notification-coordinator';
import { ReminderApplicationError, type PendingReminderMutation } from '../application/reminder';
import type { Reminder } from '../domain/reminder';
import {
  ReminderRuntimeError,
  type ReminderListPage,
  type ReminderRuntime,
  type ReminderSnapshot,
} from '../runtime/create-reminder-runtime';
import {
  emptyReminderDraft,
  parseReminderDraft,
  reminderDraftFromReminder,
  type ReminderDraft,
  type ReminderFieldErrors,
} from './reminder-form';

type NotificationPermission = ReminderNotificationPermissionStatus | 'unavailable';
type ListKind = 'upcoming' | 'past';
export type ReminderFeedback = 'saved' | 'deleted' | 'notApplied' | 'conflict' | 'notFound' |
  'uncertain' | 'failure' | 'childChanged' | 'savedPreviousChild';

export type ReminderState = Readonly<{
  status: 'loading' | 'ready' | 'error' | 'missing';
  upcoming: ReminderSnapshot<ReminderListPage> | null;
  past: ReminderSnapshot<ReminderListPage> | null;
  draft: ReminderDraft;
  editing: Reminder | null;
  fields: ReminderFieldErrors;
  busy: boolean;
  refreshing: boolean;
  paging: ListKind | null;
  pageError: ListKind | null;
  feedback: ReminderFeedback | null;
  pending: PendingReminderMutation | null;
  formVersion: number;
  notificationPermission: NotificationPermission | null;
  notificationReconciliation: ReminderNotificationReconciliationResult | null;
  notificationBusy: boolean;
}>;

const initial: ReminderState = {
  status: 'loading', upcoming: null, past: null, draft: emptyReminderDraft, editing: null,
  fields: {}, busy: false, refreshing: false, paging: null, pageError: null,
  feedback: null, pending: null, formVersion: 0, notificationPermission: null,
  notificationReconciliation: null, notificationBusy: false,
};

export function createReminderController(
  runtime: ReminderRuntime,
  notifications: ReminderNotificationsRuntime,
  selection: ActiveChildSelection,
  getCurrentEpochMs: () => number = Date.now,
) {
  let state = initial;
  let alive = true;
  let focused = false;
  let request = 0;
  let focusVersion = 0;
  let mutationLocked = false;
  let refreshQueued = false;
  let listener: ((value: ReminderState) => void) | null = null;
  let unsubscribe = () => {};
  const publish = (patch: Partial<ReminderState>) => {
    if (!alive) return;
    state = { ...state, ...patch };
    listener?.(state);
  };
  const current = (id: number, focus: number) => alive && focused && request === id && focusVersion === focus;
  const contextMatches = (left: ActiveChildContext, right: ActiveChildContext) =>
    left.childId === right.childId && left.selectionVersion === right.selectionVersion &&
    left.selectionScope === right.selectionScope;
  const contextIsCurrent = (context: ActiveChildContext) =>
    context.selectionScope === selection.scope && context.selectionVersion === selection.getVersion() &&
    !selection.isChanging();

  async function refreshNotifications(id: number, focus: number) {
    const [permission, reconciliation] = await Promise.all([
      notifications.getPermissionStatus().catch(() => 'unavailable' as const),
      notifications.reconcile().catch(() => null),
    ]);
    if (current(id, focus)) publish({
      notificationPermission: permission,
      notificationReconciliation: reconciliation,
    });
  }

  async function refresh() {
    if (!alive || !focused || selection.isChanging()) return;
    if (mutationLocked) { refreshQueued = true; return; }
    const id = ++request;
    const focus = focusVersion;
    publish({ refreshing: true, paging: null, pageError: null });
    const notificationWork = refreshNotifications(id, focus);
    try {
      const [upcoming, past] = await Promise.all([runtime.getUpcoming(), runtime.getPast()]);
      if (!current(id, focus)) return;
      if (!contextMatches(upcoming.context, past.context) || !contextIsCurrent(upcoming.context)) {
        publish({ status: 'error', upcoming: null, past: null });
        return;
      }
      publish({ status: 'ready', upcoming, past });
    } catch (error) {
      if (!current(id, focus)) return;
      publish({
        status: error instanceof ReminderRuntimeError && error.code === 'active-child-required'
          ? 'missing' : 'error',
        upcoming: null,
        past: null,
      });
    } finally {
      await notificationWork;
      if (current(id, focus)) publish({ refreshing: false });
    }
  }

  function selectionChanged(switching: boolean) {
    ++request;
    publish({
      status: 'loading', upcoming: null, past: null, draft: emptyReminderDraft, editing: null,
      fields: {}, feedback: null, paging: null, pageError: null, refreshing: false,
      formVersion: state.formVersion + 1,
    });
    if (!switching && focused) void refresh();
  }

  async function loadMore(kind: ListKind) {
    if (!alive || !focused || mutationLocked || state.refreshing || state.paging !== null) return;
    const previous = kind === 'upcoming' ? state.upcoming : state.past;
    if (previous?.value.nextCursor === null || previous === null) return;
    const id = ++request;
    const focus = focusVersion;
    publish({ paging: kind, pageError: null });
    try {
      const next = kind === 'upcoming'
        ? await runtime.getUpcoming(20, previous.value.nextCursor)
        : await runtime.getPast(20, previous.value.nextCursor);
      if (!current(id, focus) || !contextMatches(previous.context, next.context)) return;
      const seen = new Set(previous.value.items.map(item => item.id));
      const merged = { ...next, value: {
        items: [...previous.value.items, ...next.value.items.filter(item => !seen.has(item.id))],
        nextCursor: next.value.nextCursor,
      } };
      publish(kind === 'upcoming' ? { upcoming: merged } : { past: merged });
    } catch { if (current(id, focus)) publish({ pageError: kind }); }
    finally { if (current(id, focus)) publish({ paging: null }); }
  }

  function mutationContext(): ActiveChildContext | null {
    if (state.upcoming === null || state.past === null ||
      !contextMatches(state.upcoming.context, state.past.context) ||
      !contextIsCurrent(state.upcoming.context)) return null;
    return state.upcoming.context;
  }

  function mutationSucceeded(
    action: PendingReminderMutation['action'],
    ownerChildId: string,
    ownerForm: number,
    entryId?: string,
  ) {
    const sameChild = state.upcoming?.context.childId === ownerChildId;
    publish({
      pending: null,
      feedback: sameChild ? (action === 'delete' ? 'deleted' : 'saved') : 'savedPreviousChild',
      ...(sameChild && ownerForm === state.formVersion &&
        (action !== 'delete' || state.editing?.id === entryId)
        ? { draft: emptyReminderDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 }
        : {}),
    });
  }

  async function mutate(action: PendingReminderMutation['action'], expected?: Reminder, captured?: ActiveChildContext) {
    const context = captured ?? mutationContext();
    if (!alive || !focused || mutationLocked || state.pending !== null || context === null) return;
    const ownerForm = state.formVersion;
    const parsed = action === 'delete' ? null : parseReminderDraft(state.draft, getCurrentEpochMs());
    if (parsed !== null && parsed.values === null) {
      publish({ fields: parsed.errors, feedback: null });
      return;
    }
    mutationLocked = true;
    ++request;
    publish({ busy: true, refreshing: false, paging: null, fields: {}, feedback: null });
    let applied = false;
    try {
      if (action === 'record') await runtime.record(context, parsed!.values!);
      else if (action === 'update') await runtime.update(context, expected!, parsed!.values!);
      else await runtime.delete(context, expected!);
      applied = true;
      mutationSucceeded(action, context.childId, ownerForm, expected?.id);
    } catch (error) {
      if (!alive) return;
      if (error instanceof ReminderRuntimeError && error.completedMutation !== undefined) {
        applied = true;
        mutationSucceeded(action, context.childId, ownerForm, expected?.id);
      } else if (error instanceof ReminderApplicationError &&
        error.code === 'mutation-outcome-uncertain' && error.pendingReminder !== undefined) {
        publish({ pending: { action, attempt: error.pendingReminder, expected }, feedback: 'uncertain' });
      } else if (error instanceof ReminderApplicationError && error.code === 'reminder-not-in-future') {
        publish({ fields: { time: 'notFuture' } });
      } else {
        publish({ feedback: error instanceof ReminderApplicationError && error.code === 'revision-conflict' ? 'conflict'
          : error instanceof ReminderApplicationError && error.code === 'reminder-not-found' ? 'notFound'
            : error instanceof ReminderApplicationError && ['create-not-saved', 'update-not-applied', 'delete-not-applied'].includes(error.code) ? 'notApplied'
              : error instanceof ReminderRuntimeError ? 'childChanged' : 'failure' });
      }
    } finally {
      mutationLocked = false;
      publish({ busy: false });
      if (alive && focused && (applied || refreshQueued)) {
        refreshQueued = false;
        await refresh();
      }
    }
  }

  async function checkStatus() {
    const context = mutationContext();
    if (!alive || !focused || mutationLocked || state.pending === null || context === null ||
      state.pending.attempt.childId !== context.childId) return;
    const pending = state.pending;
    const ownerForm = state.formVersion;
    mutationLocked = true;
    ++request;
    publish({ busy: true, refreshing: false, paging: null });
    let settled = false;
    try {
      const result = await runtime.checkMutation(context, pending);
      if (result.value.status === 'success') {
        mutationSucceeded(pending.action, pending.attempt.childId, ownerForm, pending.attempt.id);
        settled = true;
      } else if (result.value.status === 'not-applied' || result.value.status === 'conflict') {
        settled = true;
        publish({ pending: null, feedback: result.value.status === 'conflict' ? 'conflict' : 'notApplied' });
      } else publish({ feedback: 'uncertain' });
    } catch { publish({ feedback: 'uncertain' }); }
    finally {
      mutationLocked = false;
      publish({ busy: false });
      if (alive && focused && (settled || refreshQueued)) { refreshQueued = false; await refresh(); }
    }
  }

  function prepareDeleteConfirmation(expected: Reminder) {
    const context = mutationContext();
    if (!alive || !focused || mutationLocked || state.pending !== null || context === null) return null;
    const capturedContext = Object.freeze({ ...context });
    const capturedReminder = Object.freeze({ ...expected });
    const originatingFocus = focusVersion;
    const valid = () => alive && focused && focusVersion === originatingFocus && !selection.isChanging() &&
      selection.scope === capturedContext.selectionScope && selection.getVersion() === capturedContext.selectionVersion &&
      mutationContext()?.childId === capturedContext.childId && capturedReminder.childId === capturedContext.childId;
    if (!valid()) return null;
    let consumed = false;
    return async () => {
      if (consumed) return;
      consumed = true;
      if (valid()) await mutate('delete', capturedReminder, capturedContext);
    };
  }

  return {
    get state() { return state; },
    connect() { alive = true; unsubscribe(); unsubscribe = selection.subscribe(selectionChanged); },
    subscribe(next: (value: ReminderState) => void) { listener = next; next(state); return () => { listener = null; }; },
    focus() { focused = true; const lease = ++focusVersion; void refresh(); return () => {
      if (focusVersion === lease) { focused = false; ++request; ++focusVersion; publish({ refreshing: false, paging: null }); }
    }; },
    blur() { focused = false; ++request; ++focusVersion; publish({ refreshing: false, paging: null }); },
    refresh,
    loadMore,
    checkStatus,
    changeDraft(patch: Partial<ReminderDraft>, context?: ActiveChildContext) {
      const currentContext = mutationContext();
      if (context !== undefined && (currentContext === null || !contextMatches(context, currentContext))) return;
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: { ...state.draft, ...patch }, fields: {}, feedback: null });
    },
    edit(reminder: Reminder) {
      const context = mutationContext();
      if (context === null || mutationLocked || state.pending !== null || reminder.childId !== context.childId) return;
      publish({ draft: reminderDraftFromReminder(reminder), editing: reminder, fields: {}, feedback: null,
        formVersion: state.formVersion + 1 });
    },
    cancelEdit() {
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: emptyReminderDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 });
    },
    save() { return mutate(state.editing === null ? 'record' : 'update', state.editing ?? undefined); },
    prepareDeleteConfirmation,
    async requestNotifications() {
      if (!alive || !focused || state.notificationBusy) return;
      const originatingFocus = focusVersion;
      publish({ notificationBusy: true });
      try {
        const result = await notifications.requestPermission();
        if (alive && focused && focusVersion === originatingFocus) publish({
          notificationPermission: result.permission,
          notificationReconciliation: result.reconciliation,
        });
      } catch {
        if (alive && focused && focusVersion === originatingFocus) publish({
          notificationPermission: 'unavailable',
          notificationReconciliation: null,
        });
      } finally { publish({ notificationBusy: false }); }
    },
    dispose() { alive = false; focused = false; ++request; ++focusVersion; listener = null; unsubscribe(); },
  };
}

export type ReminderController = ReturnType<typeof createReminderController>;
