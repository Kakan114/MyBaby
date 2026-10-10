import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';
import type { ChildrenRuntime } from '../../../runtime/app-runtime';
import type { ActiveChildSummary } from '../../children/application/get-active-child-summary';
import { MilestoneApplicationError, type PendingMilestoneMutation } from '../application/milestone';
import type { MilestoneHistoryPage } from '../application/milestone-repository';
import type { MilestoneEntry } from '../domain/milestone-entry';
import { MilestoneRuntimeError, type MilestoneRuntime, type MilestoneSnapshot } from '../runtime/create-milestone-runtime';
import { emptyMilestoneDraft, milestoneDraftFromEntry, parseMilestoneDraft, type MilestoneDraft, type MilestoneFieldErrors } from './milestone-form';

export type MilestoneState = Readonly<{
  status: 'loading' | 'ready' | 'error' | 'missing';
  snapshot: MilestoneSnapshot<MilestoneHistoryPage> | null;
  summary: ActiveChildSummary | null;
  draft: MilestoneDraft;
  editing: MilestoneEntry | null;
  fields: MilestoneFieldErrors;
  busy: boolean;
  refreshing: boolean;
  paging: boolean;
  pageError: boolean;
  feedback: string | null;
  pending: PendingMilestoneMutation | null;
  formVersion: number;
}>;

const initial: MilestoneState = {
  status: 'loading', snapshot: null, summary: null, draft: emptyMilestoneDraft, editing: null,
  fields: {}, busy: false, refreshing: false, paging: false, pageError: false,
  feedback: null, pending: null, formVersion: 0,
};

export function createMilestoneController(
  runtime: MilestoneRuntime,
  children: Pick<ChildrenRuntime, 'getActiveChildSummary'>,
  selection: ActiveChildSelection,
) {
  let state = initial;
  let alive = true;
  let focused = false;
  let request = 0;
  let focusVersion = 0;
  let mutationLocked = false;
  let refreshQueued = false;
  let listener: ((state: MilestoneState) => void) | null = null;
  function publish(patch: Partial<MilestoneState>) {
    if (!alive) return;
    state = { ...state, ...patch };
    listener?.(state);
  }
  const current = (id: number, focus: number) => alive && focused && id === request && focus === focusVersion;
  let unsubscribe = () => {};
  const selectionChanged = (switching: boolean) => {
    ++request;
    publish({ status: 'loading', snapshot: null, summary: null, draft: emptyMilestoneDraft, editing: null,
      fields: {}, feedback: null, paging: false, refreshing: false, formVersion: state.formVersion + 1 });
    if (!switching && focused) void refresh();
  };
  async function refresh() {
    if (!alive || !focused || selection.isChanging()) return;
    if (mutationLocked) { refreshQueued = true; return; }
    const id = ++request; const focus = focusVersion;
    publish({ refreshing: true, paging: false, pageError: false });
    try {
      const snapshot = await runtime.getHistory();
      const summary = await children.getActiveChildSummary();
      if (!current(id, focus)) return;
      if (summary === null) { publish({ status: 'missing', snapshot: null, summary: null }); return; }
      if (summary.child.id !== snapshot.context.childId || selection.getVersion() !== snapshot.context.selectionVersion) {
        publish({ status: 'error', snapshot: null, summary: null, draft: emptyMilestoneDraft, editing: null,
          fields: {}, formVersion: state.formVersion + 1 });
        return;
      }
      const changed = state.snapshot !== null && state.snapshot.context.childId !== snapshot.context.childId;
      publish({ status: 'ready', snapshot, summary,
        ...(changed ? { draft: emptyMilestoneDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 } : {}) });
    } catch (error) {
      if (!current(id, focus)) return;
      publish({ status: error instanceof MilestoneRuntimeError && error.code === 'active-child-required' ? 'missing' : 'error',
        snapshot: null, summary: null });
    } finally { if (current(id, focus)) publish({ refreshing: false }); }
  }
  async function loadMore() {
    if (!alive || !focused || mutationLocked || state.paging || state.refreshing || state.snapshot?.value.nextCursor == null) return;
    const previous = state.snapshot; const id = ++request; const focus = focusVersion;
    publish({ paging: true, pageError: false });
    try {
      const next = await runtime.getHistory(previous.context, 20, previous.value.nextCursor);
      if (!current(id, focus)) return;
      const seen = new Set(previous.value.items.map(item => item.id));
      publish({ snapshot: { ...next, value: { items: [...previous.value.items,
        ...next.value.items.filter(item => !seen.has(item.id))], nextCursor: next.value.nextCursor } } });
    } catch { if (current(id, focus)) publish({ pageError: true }); }
    finally { if (current(id, focus)) publish({ paging: false }); }
  }
  function success(action: PendingMilestoneMutation['action'], ownerChildId: string, ownerForm: number, entryId?: string) {
    if (!alive) return;
    const sameChild = state.snapshot?.context.childId === ownerChildId;
    publish({ pending: null, feedback: sameChild ? (action === 'delete' ? 'deleted' : 'saved') : 'savedPreviousChild',
      ...(sameChild && ownerForm === state.formVersion && (action !== 'delete' || state.editing?.id === entryId)
        ? { draft: emptyMilestoneDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 } : {}) });
  }
  async function mutate(action: PendingMilestoneMutation['action'], expected?: MilestoneEntry, capturedContext?: ActiveChildContext) {
    if (!alive || !focused || mutationLocked || state.pending !== null || state.snapshot === null) return;
    const snapshot = state.snapshot; const ownerForm = state.formVersion;
    const parsed = action === 'delete' ? null : parseMilestoneDraft(state.draft);
    if (parsed !== null && parsed.values === null) { publish({ fields: parsed.errors, feedback: null }); return; }
    mutationLocked = true; ++request;
    publish({ busy: true, refreshing: false, paging: false, feedback: null, fields: {} });
    let applied = false;
    try {
      if (action === 'record') await runtime.record(snapshot.context, parsed!.values!);
      else if (action === 'update') await runtime.update(snapshot.context, expected!, parsed!.values!);
      else await runtime.delete(capturedContext ?? snapshot.context, expected!);
      applied = true; success(action, snapshot.context.childId, ownerForm, expected?.id);
    } catch (error) {
      if (!alive) return;
      if (error instanceof MilestoneRuntimeError && error.completedMutation !== undefined) {
        applied = true; success(action, snapshot.context.childId, ownerForm, expected?.id);
      } else if (error instanceof MilestoneApplicationError && error.code === 'mutation-outcome-uncertain' && error.pendingEntry !== undefined) {
        publish({ pending: { action, attempt: error.pendingEntry, expected }, feedback: 'uncertain' });
      } else if (error instanceof MilestoneApplicationError && ['future-milestone', 'milestone-before-birth'].includes(error.code) && state.formVersion === ownerForm) {
        publish({ fields: { occurredOn: error.code === 'future-milestone' ? 'future' : 'beforeBirth' } });
      } else publish({ feedback: error instanceof MilestoneApplicationError && error.code === 'revision-conflict' ? 'conflict'
        : error instanceof MilestoneApplicationError && error.code === 'milestone-not-found' ? 'notFound'
          : error instanceof MilestoneApplicationError && ['create-not-saved', 'update-not-applied', 'delete-not-applied'].includes(error.code) ? 'notApplied'
            : error instanceof MilestoneRuntimeError ? 'childChanged' : 'failure' });
    } finally {
      mutationLocked = false; publish({ busy: false });
      if (alive && focused && (applied || refreshQueued)) { refreshQueued = false; await refresh(); }
    }
  }
  async function checkStatus() {
    if (!alive || !focused || mutationLocked || state.pending === null || state.snapshot === null) return;
    const pending = state.pending; const snapshot = state.snapshot; const ownerForm = state.formVersion;
    if (pending.attempt.childId !== snapshot.context.childId) return;
    mutationLocked = true; ++request; publish({ busy: true, refreshing: false, paging: false });
    let settled = false;
    try {
      const result = await runtime.checkMutation(snapshot.context, pending);
      if (result.value.status === 'success') { success(pending.action, pending.attempt.childId, ownerForm, pending.attempt.id); settled = true; }
      else if (result.value.status === 'not-applied' || result.value.status === 'conflict') {
        settled = true; publish({ pending: null, feedback: result.value.status === 'conflict' ? 'conflict' : 'notApplied' });
      } else publish({ feedback: 'uncertain' });
    } catch (error) {
      if (error instanceof MilestoneRuntimeError && error.completedMutation !== undefined) {
        success(pending.action, pending.attempt.childId, ownerForm, pending.attempt.id); settled = true;
      } else publish({ feedback: 'uncertain' });
    } finally {
      mutationLocked = false; publish({ busy: false });
      if (alive && focused && (settled || refreshQueued)) { refreshQueued = false; await refresh(); }
    }
  }
  function prepareDeleteConfirmation(expected: MilestoneEntry) {
    if (!alive || !focused || mutationLocked || state.pending !== null || state.snapshot === null) return null;
    const context = Object.freeze({ ...state.snapshot.context });
    const originatingFocus = focusVersion;
    const entry = Object.freeze({ ...expected });
    const valid = () => alive && focused && focusVersion === originatingFocus && !selection.isChanging()
      && selection.scope === context.selectionScope && selection.getVersion() === context.selectionVersion
      && state.snapshot?.context.childId === context.childId
      && state.snapshot.context.selectionVersion === context.selectionVersion
      && state.snapshot.context.selectionScope === context.selectionScope && entry.childId === context.childId;
    if (!valid()) return null;
    let consumed = false;
    return async () => {
      if (consumed) return;
      consumed = true;
      if (!valid()) return;
      await mutate('delete', entry, context);
    };
  }
  return {
    get state() { return state; },
    connect() { alive = true; unsubscribe(); unsubscribe = selection.subscribe(selectionChanged); },
    subscribe(next: (state: MilestoneState) => void) { listener = next; next(state); return () => { listener = null; }; },
    focus() { focused = true; const lease = ++focusVersion; void refresh(); return () => {
      if (focusVersion === lease) { focused = false; ++request; ++focusVersion; publish({ refreshing: false, paging: false }); }
    }; },
    blur() { focused = false; ++request; ++focusVersion; publish({ refreshing: false, paging: false }); },
    refresh, loadMore, checkStatus,
    changeDraft(patch: Partial<MilestoneDraft>, context?: ActiveChildContext) {
      if (context !== undefined && (state.snapshot?.context.childId !== context.childId || state.snapshot.context.selectionVersion !== context.selectionVersion)) return;
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: { ...state.draft, ...patch }, fields: {}, feedback: null });
    },
    selectSubject(selectionValue: MilestoneDraft['selection'], context?: ActiveChildContext) {
      if (context !== undefined && (state.snapshot?.context.childId !== context.childId || state.snapshot.context.selectionVersion !== context.selectionVersion)) return;
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: { ...state.draft, selection: selectionValue,
        customTitle: state.draft.selection === selectionValue ? state.draft.customTitle : '' }, fields: {}, feedback: null });
    },
    edit(expected: MilestoneEntry) {
      if (mutationLocked || state.pending !== null || state.snapshot?.context.childId !== expected.childId) return;
      publish({ draft: milestoneDraftFromEntry(expected), editing: expected, fields: {}, feedback: null, formVersion: state.formVersion + 1 });
    },
    cancelEdit() {
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: emptyMilestoneDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 });
    },
    save() { return mutate(state.editing === null ? 'record' : 'update', state.editing ?? undefined); },
    prepareDeleteConfirmation,
    delete(expected: MilestoneEntry) { return prepareDeleteConfirmation(expected)?.(); },
    dispose() { alive = false; focused = false; ++request; ++focusVersion; listener = null; unsubscribe(); },
  };
}

export type MilestoneController = ReturnType<typeof createMilestoneController>;
