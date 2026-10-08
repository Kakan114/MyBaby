import type { ActiveChildContext } from '../../../runtime/active-child-selection';
import type { ChildrenRuntime } from '../../../runtime/app-runtime';
import type { ActiveChildSelection } from '../../../runtime/active-child-selection';
import type { ActiveChildSummary } from '../../children/application/get-active-child-summary';
import { GrowthApplicationError, type PendingGrowthMutation } from '../application/growth';
import { GrowthRuntimeError, type GrowthRuntime, type GrowthSnapshot } from '../runtime/create-growth-runtime';
import type { GrowthHistoryPage } from '../application/growth-repository';
import type { GrowthMeasurement } from '../domain/growth-measurement';
import { emptyGrowthDraft, growthDraftFromMeasurement, parseGrowthDraft, type GrowthDraft, type GrowthFieldErrors } from './growth-form';

export type GrowthState = Readonly<{
  status: 'loading' | 'ready' | 'error' | 'missing';
  snapshot: GrowthSnapshot<GrowthHistoryPage> | null;
  summary: ActiveChildSummary | null;
  draft: GrowthDraft; editing: GrowthMeasurement | null; fields: GrowthFieldErrors;
  busy: boolean; refreshing: boolean; paging: boolean; pageError: boolean;
  feedback: string | null; pending: PendingGrowthMutation | null; formVersion: number;
}>;
const initial: GrowthState = { status: 'loading', snapshot: null, summary: null, draft: emptyGrowthDraft,
  editing: null, fields: {}, busy: false, refreshing: false, paging: false, pageError: false, feedback: null, pending: null, formVersion: 0 };

export function createGrowthController(runtime: GrowthRuntime, children: Pick<ChildrenRuntime, 'getActiveChildSummary'>, selection: ActiveChildSelection) {
  let state = initial;
  let alive = true;
  let focused = false;
  let request = 0;
  let focusVersion = 0;
  let mutationLocked = false;
  let refreshQueued = false;
  let listener: ((state: GrowthState) => void) | null = null;
  function publish(patch: Partial<GrowthState>) {
    if (!alive) return;
    state = { ...state, ...patch };
    listener?.(state);
  }
  const current = (id: number, focus: number) => alive && focused && id === request && focus === focusVersion;
  let unsubscribe = () => {};
  const selectionChanged = (switching: boolean) => {
    ++request;
    publish({ status: 'loading', snapshot: null, summary: null, draft: emptyGrowthDraft, editing: null,
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
        publish({ status: 'error', snapshot: null, summary: null, draft: emptyGrowthDraft, editing: null,
          fields: {}, formVersion: state.formVersion + 1 });
        return;
      }
      const changed = state.snapshot !== null && state.snapshot.context.childId !== snapshot.context.childId;
      publish({ status: 'ready', snapshot, summary,
        ...(changed ? { draft: emptyGrowthDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 } : {}) });
    } catch (error) {
      if (!current(id, focus)) return;
      publish({ status: error instanceof GrowthRuntimeError && error.code === 'active-child-required' ? 'missing' : 'error',
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
      publish({ snapshot: { ...next, value: {
        items: [...previous.value.items, ...next.value.items.filter(item => !seen.has(item.id))],
        nextCursor: next.value.nextCursor,
      } } });
    } catch { if (current(id, focus)) publish({ pageError: true }); }
    finally { if (current(id, focus)) publish({ paging: false }); }
  }
  function success(action: PendingGrowthMutation['action'], ownerChildId: string, ownerForm: number, measurementId?: string) {
    if (!alive) return;
    const sameChild = state.snapshot?.context.childId === ownerChildId;
    publish({ pending: null, feedback: sameChild ? (action === 'delete' ? 'deleted' : 'saved') : 'savedPreviousChild',
      ...(sameChild && ownerForm === state.formVersion && (action !== 'delete' || state.editing?.id === measurementId) ? {
        draft: emptyGrowthDraft, editing: null, fields: {}, formVersion: state.formVersion + 1,
      } : {}) });
  }
  async function mutate(action: PendingGrowthMutation['action'], expected?: GrowthMeasurement, capturedContext?: ActiveChildContext) {
    if (!alive || !focused || mutationLocked || state.pending !== null || state.snapshot === null) return;
    const snapshot = state.snapshot; const ownerForm = state.formVersion;
    const parsed = action === 'delete' ? null : parseGrowthDraft(state.draft);
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
      if (error instanceof GrowthRuntimeError && error.completedMutation !== undefined) {
        applied = true; success(action, snapshot.context.childId, ownerForm, expected?.id);
      } else if (error instanceof GrowthApplicationError && error.code === 'mutation-outcome-uncertain' && error.pendingMeasurement !== undefined) {
        publish({ pending: { action, attempt: error.pendingMeasurement, expected }, feedback: 'uncertain' });
      } else if (error instanceof GrowthApplicationError && ['future-measurement', 'measurement-before-birth'].includes(error.code) &&
          state.formVersion === ownerForm) {
        publish({ fields: { date: error.code === 'future-measurement' ? 'future' : 'beforeBirth' } });
      } else publish({ feedback: error instanceof GrowthApplicationError && error.code === 'revision-conflict' ? 'conflict' :
        error instanceof GrowthApplicationError && error.code === 'measurement-not-found' ? 'notFound' :
        error instanceof GrowthApplicationError && ['create-not-saved', 'update-not-applied', 'delete-not-applied'].includes(error.code) ? 'notApplied' :
        error instanceof GrowthRuntimeError ? 'childChanged' : 'failure' });
    } finally {
      mutationLocked = false;
      publish({ busy: false });
      if (alive && focused && (applied || refreshQueued)) {
        refreshQueued = false;
        await refresh(); // Feedback survives a failed history refresh; a committed mutation is still a success.
      }
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
        settled = true;
        publish({ pending: null, feedback: result.value.status === 'conflict' ? 'conflict' : 'notApplied' });
      } else publish({ feedback: 'uncertain' });
    } catch (error) {
      if (error instanceof GrowthRuntimeError && error.completedMutation !== undefined) {
        success(pending.action, pending.attempt.childId, ownerForm, pending.attempt.id); settled = true;
      } else publish({ feedback: 'uncertain' });
    } finally {
      mutationLocked = false; publish({ busy: false });
      if (alive && focused && (settled || refreshQueued)) { refreshQueued = false; await refresh(); }
    }
  }
  function prepareDeleteConfirmation(expected: GrowthMeasurement) {
    if (!alive || !focused || mutationLocked || state.pending !== null || state.snapshot === null) return null;
    const context = Object.freeze({ ...state.snapshot.context });
    const originatingFocus = focusVersion;
    const measurement = Object.freeze({ ...expected });
    const valid = () => alive && focused && focusVersion === originatingFocus &&
      !selection.isChanging() && selection.scope === context.selectionScope &&
      selection.getVersion() === context.selectionVersion &&
      state.snapshot?.context.childId === context.childId &&
      state.snapshot.context.selectionVersion === context.selectionVersion &&
      state.snapshot.context.selectionScope === context.selectionScope && measurement.childId === context.childId;
    if (!valid()) return null;
    let consumed = false;
    return async () => {
      if (consumed) return;
      consumed = true;
      // Returning to the same child or screen never renews an old confirmation.
      if (!valid()) return;
      await mutate('delete', measurement, context);
    };
  }
  return {
    get state() { return state; },
    connect() { alive = true; unsubscribe(); unsubscribe = selection.subscribe(selectionChanged); },
    subscribe(next: (state: GrowthState) => void) { listener = next; next(state); return () => { listener = null; }; },
    focus() {
      focused = true; const lease = ++focusVersion; void refresh();
      return () => { if (focusVersion === lease) { focused = false; ++request; ++focusVersion; publish({ refreshing: false, paging: false }); } };
    },
    blur() { focused = false; ++request; ++focusVersion; publish({ refreshing: false, paging: false }); },
    refresh, loadMore, checkStatus,
    changeDraft(patch: Partial<GrowthDraft>, context?: ActiveChildContext) {
      if (context !== undefined && (state.snapshot?.context.childId !== context.childId || state.snapshot.context.selectionVersion !== context.selectionVersion)) return;
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: { ...state.draft, ...patch }, fields: {}, feedback: null });
    },
    edit(expected: GrowthMeasurement) {
      if (mutationLocked || state.pending !== null || state.snapshot?.context.childId !== expected.childId) return;
      publish({ draft: growthDraftFromMeasurement(expected), editing: expected, fields: {}, feedback: null, formVersion: state.formVersion + 1 });
    },
    cancelEdit() {
      if (mutationLocked || state.pending !== null) return;
      publish({ draft: emptyGrowthDraft, editing: null, fields: {}, formVersion: state.formVersion + 1 });
    },
    save() { return mutate(state.editing === null ? 'record' : 'update', state.editing ?? undefined); },
    prepareDeleteConfirmation,
    delete(expected: GrowthMeasurement) { return prepareDeleteConfirmation(expected)?.(); },
    dispose() { alive = false; focused = false; ++request; ++focusVersion; listener = null; unsubscribe(); },
  };
}
export type GrowthController = ReturnType<typeof createGrowthController>;
