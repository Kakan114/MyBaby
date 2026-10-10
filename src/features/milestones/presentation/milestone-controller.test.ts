import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { getChildAge } from '../../children/domain/age';
import { MilestoneApplicationError } from '../application/milestone';
import { createMilestoneEntry } from '../domain/milestone-entry';
import { MilestoneRuntimeError, type MilestoneRuntime } from '../runtime/create-milestone-runtime';
import { createMilestoneController } from './milestone-controller';

const today = createCalendarDate('2026-10-08');
const child = { id: 'a', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-01-01') };
const context = { childId: 'a', selectionVersion: 0, selectionScope: {} };
const entry = createMilestoneEntry({ id: 'id', childId: 'a', subject: { kind: 'predefined', definitionId: 'social.first-smile' }, occurredOn: today, note: null, revision: 1 });
const snapshot = { context, child, value: { items: [entry], nextCursor: null } };
const summary = { child, age: getChildAge(child.dateOfBirth, today) };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function flush() { for (let index = 0; index < 15; index++) await Promise.resolve(); }
function fixture() {
  let listener: (switching: boolean) => void = () => {}; let version = 0;
  const runtime: MilestoneRuntime = {
    getHistory: vi.fn(async () => snapshot), getById: vi.fn(async () => ({ context, child, value: entry })),
    record: vi.fn(async () => ({ context, child, value: entry })),
    update: vi.fn(async () => ({ context, child, value: { ...entry, revision: 2 } })),
    delete: vi.fn(async () => ({ context, child, value: null })),
    checkMutation: vi.fn(async () => ({ context, child, value: { status: 'success' as const } })),
  };
  const children = { getActiveChildSummary: vi.fn(async () => summary) };
  const selection = { scope: context.selectionScope, isChanging: () => false, getVersion: () => version,
    subscribe: (next: typeof listener) => { listener = next; return vi.fn(); } };
  const controller = createMilestoneController(runtime, children, selection);
  controller.connect(); controller.subscribe(vi.fn()); const blur = controller.focus();
  return { runtime, children, controller, selection, blur,
    switching() { ++version; listener(true); }, finished() { listener(false); } };
}
async function ready() {
  const value = fixture(); await flush();
  value.controller.selectSubject('social.first-smile', context);
  value.controller.changeDraft({ occurredOn: today }, context);
  return value;
}

describe('Milestone presentation lifecycle and mutation safety', () => {
  it('loads canonical child summary and recent history', async () => {
    const value = await ready();
    expect(value.controller.state.status).toBe('ready');
    expect(value.controller.state.summary).toEqual(summary);
    expect(value.controller.state.snapshot?.value.items).toEqual([entry]);
  });
  it('prevents duplicate submission synchronously and clears a confirmed form', async () => {
    const value = await ready(); const pending = deferred<{ context: typeof context; child: typeof child; value: typeof entry }>();
    vi.mocked(value.runtime.record).mockReturnValueOnce(pending.promise);
    const first = value.controller.save(); await value.controller.save();
    expect(value.runtime.record).toHaveBeenCalledTimes(1);
    pending.resolve({ context, child, value: entry }); await first;
    expect(value.controller.state.feedback).toBe('saved');
    expect(value.controller.state.draft).toMatchObject({ selection: null, occurredOn: null });
  });
  it('clears hidden custom data whenever subject mode changes', async () => {
    const value = await ready();
    value.controller.selectSubject('custom', context); value.controller.changeDraft({ customTitle: 'Eget minne' }, context);
    value.controller.selectSubject('custom', context);
    expect(value.controller.state.draft.customTitle).toBe('Eget minne');
    value.controller.selectSubject('motor.crawls', context);
    expect(value.controller.state.draft).toMatchObject({ selection: 'motor.crawls', customTitle: '' });
    value.controller.selectSubject('custom', context);
    expect(value.controller.state.draft.customTitle).toBe('');
  });
  it('maps authoritative birth/today validation to the date field', async () => {
    for (const code of ['future-milestone', 'milestone-before-birth'] as const) {
      const value = await ready(); vi.mocked(value.runtime.record).mockRejectedValueOnce(new MilestoneApplicationError(code));
      await value.controller.save();
      expect(value.controller.state.fields.occurredOn).toBe(code === 'future-milestone' ? 'future' : 'beforeBirth');
    }
  });
  it('preserves exact uncertain mutation and reconciles read-only without replay', async () => {
    const value = await ready();
    vi.mocked(value.runtime.record).mockRejectedValueOnce(new MilestoneApplicationError('mutation-outcome-uncertain', entry));
    await value.controller.save();
    expect(value.controller.state.pending).toEqual({ action: 'record', attempt: entry, expected: undefined });
    await value.controller.save(); expect(value.runtime.record).toHaveBeenCalledTimes(1);
    await value.controller.checkStatus();
    expect(value.runtime.checkMutation).toHaveBeenCalledWith(context, { action: 'record', attempt: entry, expected: undefined });
    expect(value.controller.state.pending).toBeNull();
  });
  it.each(['uncertain', 'not-applied', 'conflict'] as const)('handles reconciliation result %s safely', async status => {
    const value = await ready();
    vi.mocked(value.runtime.record).mockRejectedValueOnce(new MilestoneApplicationError('mutation-outcome-uncertain', entry));
    await value.controller.save();
    vi.mocked(value.runtime.checkMutation).mockResolvedValueOnce({ context, child, value: { status } });
    await value.controller.checkStatus();
    expect(value.controller.state.pending === null).toBe(status !== 'uncertain');
    expect(value.runtime.record).toHaveBeenCalledTimes(1);
  });
  it('edits using the exact original snapshot and revision', async () => {
    const value = await ready(); value.controller.edit(entry);
    value.controller.selectSubject('custom', context); value.controller.changeDraft({ customTitle: 'Eget', occurredOn: today }, context);
    await value.controller.save();
    expect(value.runtime.update).toHaveBeenCalledWith(context, entry, { subject: { kind: 'custom', title: 'Eget' }, occurredOn: today, note: null });
  });
  it('requires and consumes an exact delete confirmation once', async () => {
    const value = await ready(); const confirm = value.controller.prepareDeleteConfirmation(entry)!;
    expect(value.runtime.delete).not.toHaveBeenCalled(); await confirm(); await confirm();
    expect(value.runtime.delete).toHaveBeenCalledTimes(1);
    expect(value.runtime.delete).toHaveBeenCalledWith(expect.objectContaining(context), entry);
  });
  it.each([false, true])('rejects A→B stale deletion confirmations (return to A=%s)', async returnToA => {
    const value = await ready(); const confirm = value.controller.prepareDeleteConfirmation(entry)!;
    value.switching();
    if (returnToA) { value.finished(); await flush(); value.switching(); value.finished(); await flush(); }
    await confirm(); expect(value.runtime.delete).not.toHaveBeenCalled();
  });
  it('rejects delete confirmation after blur/refocus, unmount or runtime scope replacement', async () => {
    const blurred = await ready(); const afterBlur = blurred.controller.prepareDeleteConfirmation(entry)!;
    blurred.blur(); blurred.controller.focus(); await flush(); await afterBlur(); expect(blurred.runtime.delete).not.toHaveBeenCalled();
    const unmounted = await ready(); const afterUnmount = unmounted.controller.prepareDeleteConfirmation(entry)!;
    unmounted.controller.dispose(); await afterUnmount(); expect(unmounted.runtime.delete).not.toHaveBeenCalled();
    const scope = await ready(); const afterScope = scope.controller.prepareDeleteConfirmation(entry)!;
    scope.selection.scope = {}; await afterScope(); expect(scope.runtime.delete).not.toHaveBeenCalled();
  });
  it('rejects an outgoing confirmation after the provider replaces its runtime/controller', async () => {
    const outgoing = await ready(); const confirm = outgoing.controller.prepareDeleteConfirmation(entry)!;
    outgoing.controller.dispose(); const replacement = await ready();
    await confirm();
    expect(outgoing.runtime.delete).not.toHaveBeenCalled();
    expect(replacement.runtime.delete).not.toHaveBeenCalled();
  });
  it.each(['revision-conflict', 'milestone-not-found', 'update-not-applied'] as const)('uses safe edit feedback for %s', async code => {
    const value = await ready(); value.controller.edit(entry);
    vi.mocked(value.runtime.update).mockRejectedValueOnce(new MilestoneApplicationError(code));
    await value.controller.save();
    expect(value.controller.state.feedback).toBe(code === 'revision-conflict' ? 'conflict' : code === 'milestone-not-found' ? 'notFound' : 'notApplied');
  });
  it('clears child A form/history immediately and rejects stale picker callbacks', async () => {
    const value = await ready(); value.controller.selectSubject('custom', context); value.controller.changeDraft({ customTitle: 'A' }, context);
    value.switching();
    expect(value.controller.state.snapshot).toBeNull(); expect(value.controller.state.draft.selection).toBeNull();
    value.controller.changeDraft({ occurredOn: today }, context);
    expect(value.controller.state.draft.occurredOn).toBeNull();
  });
  it('ignores stale reads and async completions after blur', async () => {
    const value = await ready(); const older = deferred<typeof snapshot>();
    vi.mocked(value.runtime.getHistory).mockReturnValueOnce(older.promise);
    const refresh = value.controller.refresh(); value.blur();
    older.resolve({ ...snapshot, value: { items: [{ ...entry, id: 'stale' }], nextCursor: null } }); await refresh;
    expect(value.controller.state.snapshot?.value.items).toEqual([entry]);
  });
  it('paginates with the canonical cursor, stable merge and retry state', async () => {
    const value = await ready(); const cursor = { childId: 'a', occurredOn: today, id: 'id' };
    vi.mocked(value.runtime.getHistory).mockResolvedValueOnce({ ...snapshot, value: { items: [entry], nextCursor: cursor } });
    await value.controller.refresh();
    const older = { ...entry, id: 'older' };
    vi.mocked(value.runtime.getHistory).mockResolvedValueOnce({ ...snapshot, value: { items: [entry, older], nextCursor: null } });
    await value.controller.loadMore();
    expect(value.runtime.getHistory).toHaveBeenLastCalledWith(context, 20, cursor);
    expect(value.controller.state.snapshot?.value.items.map(item => item.id)).toEqual(['id', 'older']);
  });
  it('recognizes completion after a stale context without losing confirmed success', async () => {
    const value = await ready();
    vi.mocked(value.runtime.record).mockRejectedValueOnce(new MilestoneRuntimeError('stale-child-context', { action: 'record', entry }));
    await value.controller.save();
    expect(value.controller.state.feedback).toBe('saved');
  });
});
