import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { getChildAge } from '../../children/domain/age';
import { createGrowthMeasurement } from '../domain/growth-measurement';
import { GrowthApplicationError } from '../application/growth';
import { GrowthRuntimeError, type GrowthRuntime } from '../runtime/create-growth-runtime';
import { createGrowthController } from './growth-controller';

const today = createCalendarDate('2026-10-08');
const child = { id: 'a', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-01-01') };
const context = { childId: 'a', selectionVersion: 0, selectionScope: {} };
const value = createGrowthMeasurement({ id: 'id', childId: 'a', measuredOn: today, weightGrams: 4567,
  lengthMm: null, headCircumferenceMm: null, lengthMethod: null, revision: 1 });
const snapshot = { context, child, value: { items: [value], nextCursor: null } };
const summary = { child, age: getChildAge(child.dateOfBirth, today) };
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
function fixture() {
  let listener: (switching: boolean) => void = () => {};
  let version = 0;
  const runtime: GrowthRuntime = {
    getHistory: vi.fn(async () => snapshot),
    getById: vi.fn(async () => ({ context, child, value })),
    record: vi.fn(async () => ({ context, child, value })),
    update: vi.fn(async () => ({ context, child, value: { ...value, revision: 2 } })),
    delete: vi.fn(async () => ({ context, child, value: null })),
    checkMutation: vi.fn(async () => ({ context, child, value: { status: 'success' as const } })),
  };
  const children = { getActiveChildSummary: vi.fn(async () => summary) };
  const unsubscribe = vi.fn();
  const selection = { scope: context.selectionScope, isChanging: () => false, getVersion: () => version,
    subscribe: (next: typeof listener) => { listener = next; return unsubscribe; } };
  const controller = createGrowthController(runtime, children, selection);
  const publish = vi.fn();
  controller.connect(); controller.subscribe(publish);
  const blur = controller.focus();
  return { runtime, children, controller, publish, blur, unsubscribe, selection,
    switching() { ++version; listener(true); }, finished() { listener(false); } };
}
async function ready() {
  const f = fixture(); await flush();
  f.controller.changeDraft({ date: today, weight: '4,567' });
  return f;
}

describe('Growth presentation lifecycle and mutation safety', () => {
  it('uses the captured context and revision once for normal confirmed deletion', async () => {
    const f = await ready();
    const confirm = f.controller.prepareDeleteConfirmation(value)!;
    await f.controller.refresh();
    await confirm(); await confirm();
    expect(f.runtime.delete).toHaveBeenCalledTimes(1);
    expect(f.runtime.delete).toHaveBeenCalledWith(context, value);
    expect(vi.mocked(f.runtime.delete).mock.calls[0][0]).not.toBe(context);
    expect(f.controller.state.feedback).toBe('deleted');
  });
  it('does not delete without confirmation', async () => {
    const f = await ready();
    expect(f.controller.prepareDeleteConfirmation(value)).not.toBeNull();
    await f.controller.refresh();
    expect(f.runtime.delete).not.toHaveBeenCalled();
  });
  it.each([false, true])('rejects child switching confirmations (return to A=%s)', async returnToA => {
    const f = await ready();
    const confirm = f.controller.prepareDeleteConfirmation(value)!;
    async function switchTo(childId: string, selectionVersion: number) {
      f.switching();
      const nextChild = { ...child, id: childId };
      vi.mocked(f.runtime.getHistory).mockResolvedValue({ ...snapshot, child: nextChild,
        context: { ...context, childId, selectionVersion },
        value: { items: childId === 'a' ? [value] : [], nextCursor: null } });
      f.children.getActiveChildSummary.mockResolvedValue({ ...summary, child: nextChild });
      f.finished(); await flush();
      expect(f.controller.state.status).toBe('ready');
    }
    await switchTo('b', 1);
    if (returnToA) await switchTo('a', 2);
    await confirm();
    expect(f.runtime.delete).not.toHaveBeenCalled();
    expect(f.runtime.record).not.toHaveBeenCalled();
    expect(f.runtime.update).not.toHaveBeenCalled();
    if (returnToA) expect(f.controller.state.snapshot?.value.items).toEqual([value]);
  });
  it('rejects confirmation after blur and refocus with the same record', async () => {
    const f = await ready(); const confirm = f.controller.prepareDeleteConfirmation(value)!;
    f.blur(); f.controller.focus(); await flush(); await confirm();
    expect(f.controller.state.snapshot?.value.items).toEqual([value]);
    expect(f.runtime.delete).not.toHaveBeenCalled();
  });
  it('rejects confirmation after unmount', async () => {
    const f = await ready(); const confirm = f.controller.prepareDeleteConfirmation(value)!;
    f.controller.dispose(); await confirm();
    expect(f.runtime.delete).not.toHaveBeenCalled();
  });
  it('rejects outgoing confirmations after runtime replacement', async () => {
    const outgoing = await ready(); const confirm = outgoing.controller.prepareDeleteConfirmation(value)!;
    outgoing.controller.dispose(); const replacement = await ready(); await confirm();
    expect(outgoing.runtime.delete).not.toHaveBeenCalled();
    expect(replacement.runtime.delete).not.toHaveBeenCalled();
    expect(replacement.controller.state.snapshot?.value.items).toEqual([value]);
  });
  it('rejects a changed runtime scope even without cleanup', async () => {
    const f = await ready(); const confirm = f.controller.prepareDeleteConfirmation(value)!;
    f.selection.scope = {}; await confirm();
    expect(f.runtime.delete).not.toHaveBeenCalled();
  });
  it('preserves revision conflict handling for confirmed deletion', async () => {
    const f = await ready();
    vi.mocked(f.runtime.delete).mockRejectedValueOnce(new GrowthApplicationError('revision-conflict'));
    await f.controller.prepareDeleteConfirmation(value)!();
    expect(f.runtime.delete).toHaveBeenCalledTimes(1);
    expect(f.controller.state.feedback).toBe('conflict');
  });
  it('does not discard an unrelated edit draft after deleting another measurement', async () => {
    const f = await ready();
    f.controller.edit(value);
    f.controller.changeDraft({ weight: '5' });
    await f.controller.delete({ ...value, id: 'another' });
    expect(f.controller.state.editing).toEqual(value);
    expect(f.controller.state.draft.weight).toBe('5');
    expect(f.controller.state.feedback).toBe('deleted');
  });
  it('clears an invalidated pagination loading flag during a newer refresh', async () => {
    const f = await ready();
    const cursor = { childId: 'a', measuredOn: today, id: 'id' };
    vi.mocked(f.runtime.getHistory).mockResolvedValueOnce({ ...snapshot, value: { items: [value], nextCursor: cursor } });
    await f.controller.refresh();
    const pending = deferred<typeof snapshot>();
    vi.mocked(f.runtime.getHistory).mockReturnValueOnce(pending.promise);
    const more = f.controller.loadMore();
    expect(f.controller.state.paging).toBe(true);
    await f.controller.refresh();
    expect(f.controller.state.paging).toBe(false);
    pending.resolve({ ...snapshot, value: { items: [{ ...value, id: 'stale' }], nextCursor: null } });
    await more;
    expect(f.controller.state.snapshot?.value.items).toEqual([value]);
  });
  it('lets a newer focus lease survive outgoing screen cleanup', async () => {
    const f = await ready();
    const leaveNew = f.controller.focus();
    f.blur(); // Cleanup for the older screen must not blur the newly focused screen.
    await flush();
    const reads = vi.mocked(f.runtime.getHistory).mock.calls.length;
    await f.controller.refresh();
    expect(f.runtime.getHistory).toHaveBeenCalledTimes(reads + 1);
    leaveNew();
  });
  it('never reads more history after disposal', async () => {
    const f = await ready();
    const cursor = { childId: 'a', measuredOn: today, id: 'id' };
    vi.mocked(f.runtime.getHistory).mockResolvedValueOnce({ ...snapshot, value: { items: [value], nextCursor: cursor } });
    await f.controller.refresh();
    f.controller.dispose();
    const reads = vi.mocked(f.runtime.getHistory).mock.calls.length;
    await f.controller.loadMore();
    expect(f.runtime.getHistory).toHaveBeenCalledTimes(reads);
  });
  it('loads canonical child age and preserves ready content during routine refresh', async () => {
    const f = await ready();
    expect(f.controller.state.summary).toEqual(summary);
    const pending = deferred<typeof snapshot>();
    vi.mocked(f.runtime.getHistory).mockReturnValueOnce(pending.promise);
    const refresh = f.controller.refresh();
    expect(f.controller.state.status).toBe('ready');
    expect(f.controller.state.refreshing).toBe(true);
    pending.resolve(snapshot); await refresh;
  });
  it('shows field validation before any runtime write', async () => {
    const f = await ready();
    f.controller.changeDraft({ weight: '4,5678' });
    await f.controller.save();
    expect(f.controller.state.fields.weight).toBe('weight');
    expect(f.runtime.record).not.toHaveBeenCalled();
  });
  it('blocks duplicate submissions while pending', async () => {
    const f = await ready();
    const pending = deferred<{ context: typeof context; child: typeof child; value: typeof value }>();
    vi.mocked(f.runtime.record).mockReturnValueOnce(pending.promise);
    const save = f.controller.save();
    await f.controller.save();
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
    pending.resolve({ context, child, value }); await save;
    expect(f.controller.state.feedback).toBe('saved');
    expect(f.controller.state.draft.weight).toBe('');
  });
  it('keeps confirmed success when the following history refresh fails', async () => {
    const f = await ready();
    vi.mocked(f.runtime.getHistory).mockRejectedValueOnce(new Error('private SQL details'));
    await f.controller.save();
    expect(f.controller.state.status).toBe('error');
    expect(f.controller.state.feedback).toBe('saved');
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
  });
  it('preserves uncertain ID and payload across blur, focus and history navigation without replay', async () => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new GrowthApplicationError('mutation-outcome-uncertain', value));
    await f.controller.save();
    expect(f.controller.state.pending?.attempt).toBe(value);
    f.blur(); f.controller.focus(); await flush();
    await f.controller.save();
    f.controller.changeDraft({ weight: '5' }); f.controller.cancelEdit();
    expect(f.controller.state.draft.weight).toBe('4,567');
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
    await f.controller.checkStatus();
    expect(f.runtime.checkMutation).toHaveBeenCalledWith(context, { action: 'record', attempt: value, expected: undefined });
    expect(f.controller.state.pending).toBeNull();
    expect(f.controller.state.feedback).toBe('saved');
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
  });
  it.each(['uncertain', 'not-applied', 'conflict'] as const)('handles read-only status outcome %s', async status => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new GrowthApplicationError('mutation-outcome-uncertain', value));
    await f.controller.save();
    vi.mocked(f.runtime.checkMutation).mockResolvedValueOnce({ context, child, value: { status } });
    await f.controller.checkStatus();
    expect(f.controller.state.pending === null).toBe(status !== 'uncertain');
    expect(f.controller.state.feedback).toBe(status === 'not-applied' ? 'notApplied' : status);
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
  });
  it('keeps pending payload if the status read fails', async () => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new GrowthApplicationError('mutation-outcome-uncertain', value));
    await f.controller.save();
    vi.mocked(f.runtime.checkMutation).mockRejectedValueOnce(new Error('private path/key'));
    await f.controller.checkStatus();
    expect(f.controller.state.pending?.attempt).toBe(value);
    expect(f.controller.state.feedback).toBe('uncertain');
  });
  it('passes original expected revisions for edits and deletes', async () => {
    const f = await ready();
    f.controller.edit(value);
    f.controller.changeDraft({ weight: '5' });
    await f.controller.save();
    expect(f.runtime.update).toHaveBeenCalledWith(context, value, expect.objectContaining({ weightGrams: 5000 }));
    await f.controller.delete(value);
    expect(f.runtime.delete).toHaveBeenCalledWith(context, value);
    expect(f.controller.state.feedback).toBe('deleted');
  });
  it.each(['revision-conflict', 'measurement-not-found', 'update-not-applied'] as const)('uses safe mutation feedback for %s', async code => {
    const f = await ready(); f.controller.edit(value);
    vi.mocked(f.runtime.update).mockRejectedValueOnce(new GrowthApplicationError(code));
    await f.controller.save();
    expect(f.controller.state.feedback).toBe(code === 'revision-conflict' ? 'conflict' : code === 'measurement-not-found' ? 'notFound' : 'notApplied');
  });
  it.each(['future-measurement', 'measurement-before-birth'] as const)('maps authoritative date rejection %s to the field', async code => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new GrowthApplicationError(code));
    await f.controller.save();
    expect(f.controller.state.fields.date).toBe(code === 'future-measurement' ? 'future' : 'beforeBirth');
  });
  it('clears child A forms and history immediately on switching and rejects old picker callbacks', async () => {
    const f = await ready();
    f.switching();
    expect(f.controller.state.snapshot).toBeNull();
    expect(f.controller.state.summary).toBeNull();
    expect(f.controller.state.draft.weight).toBe('');
    f.controller.changeDraft({ date: today, weight: '8' }, context);
    expect(f.controller.state.draft.weight).toBe('');
    await f.controller.save();
    expect(f.runtime.record).not.toHaveBeenCalled();
  });
  it('retains uncertain child A writes while clearing A content during switching', async () => {
    const f = await ready();
    const pending = deferred<never>();
    vi.mocked(f.runtime.record).mockReturnValueOnce(pending.promise);
    const save = f.controller.save(); f.switching();
    pending.reject(new GrowthApplicationError('mutation-outcome-uncertain', value)); await save;
    expect(f.controller.state.pending?.attempt.childId).toBe('a');
    expect(f.controller.state.snapshot).toBeNull();
    expect(f.controller.state.draft.weight).toBe('');
    await f.controller.checkStatus();
    expect(f.runtime.checkMutation).not.toHaveBeenCalled();
  });
  it('recognizes a known successful old-child mutation', async () => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new GrowthRuntimeError('stale-child-context', { action: 'record', measurement: value }));
    f.controller.save();
    f.switching(); await flush();
    expect(f.controller.state.feedback).toBe('savedPreviousChild');
    expect(f.controller.state.pending).toBeNull();
  });
  it('ignores stale refreshes and protects blur/disposal from async updates', async () => {
    const f = await ready();
    const older = deferred<typeof snapshot>();
    vi.mocked(f.runtime.getHistory).mockReturnValueOnce(older.promise);
    const first = f.controller.refresh();
    await f.controller.refresh();
    older.reject(new Error('old read')); await first;
    expect(f.controller.state.status).toBe('ready');
    const later = deferred<typeof snapshot>();
    vi.mocked(f.runtime.getHistory).mockReturnValueOnce(later.promise);
    const second = f.controller.refresh();
    f.blur(); const calls = f.publish.mock.calls.length;
    later.resolve(snapshot); await second;
    expect(f.publish).toHaveBeenCalledTimes(calls);
    f.controller.dispose();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    await f.controller.save();
    expect(f.runtime.record).not.toHaveBeenCalled();
  });
  it('rejects cross-child header/summary snapshots', async () => {
    const f = await ready();
    vi.mocked(f.children.getActiveChildSummary).mockResolvedValueOnce({ ...summary, child: { ...child, id: 'b' } });
    await f.controller.refresh();
    expect(f.controller.state.summary).toBeNull();
    expect(f.controller.state.snapshot).toBeNull();
    expect(f.controller.state.status).toBe('error');
  });
  it('paginates with canonical cursors, preserves same-day entries and retries a failed page', async () => {
    const f = await ready();
    const cursor = { childId: 'a', measuredOn: today, id: 'id' };
    vi.mocked(f.runtime.getHistory).mockResolvedValueOnce({ ...snapshot, value: { items: [value], nextCursor: cursor } });
    await f.controller.refresh();
    vi.mocked(f.runtime.getHistory).mockRejectedValueOnce(new Error('page'));
    await f.controller.loadMore();
    expect(f.controller.state.pageError).toBe(true);
    const another = { ...value, id: 'another' };
    vi.mocked(f.runtime.getHistory).mockResolvedValueOnce({ ...snapshot, value: { items: [value, another], nextCursor: null } });
    await f.controller.loadMore();
    expect(f.runtime.getHistory).toHaveBeenLastCalledWith(context, 20, cursor);
    expect(f.controller.state.snapshot?.value.items.map(item => item.id)).toEqual(['id', 'another']);
    expect(f.controller.state.pageError).toBe(false);
  });
  it('represents missing active child without inferring onboarding', async () => {
    const f = await ready();
    vi.mocked(f.runtime.getHistory).mockRejectedValueOnce(new GrowthRuntimeError('active-child-required'));
    await f.controller.refresh();
    expect(f.controller.state.status).toBe('missing');
    expect(f.controller.state.snapshot).toBeNull();
  });
});
