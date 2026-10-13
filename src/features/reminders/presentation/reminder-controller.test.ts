import { describe, expect, it, vi } from 'vitest';
import type { ReminderNotificationsRuntime } from '../../../runtime/app-runtime';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { ReminderApplicationError } from '../application/reminder';
import { createReminder } from '../domain/reminder';
import { ReminderRuntimeError, type ReminderRuntime } from '../runtime/create-reminder-runtime';
import { createReminderController } from './reminder-controller';

const now = new Date(2026, 9, 10, 12).getTime();
const scope = {};
const context = { childId: 'a', selectionVersion: 0, selectionScope: scope };
const child = { id: 'a', displayName: 'Mio', dateOfBirth: createCalendarDate('2026-01-01') };
const reminder = createReminder({ id: 'r1', childId: 'a', title: 'BVC', scheduledAtEpochMs: now + 60_000, revision: 1 });
const page = { items: [reminder], nextCursor: null };
const snapshot = { context, child, value: page };
const mutationSnapshot = { context, child, value: reminder };
const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }

function fixture() {
  let version = 0;
  let listener: (switching: boolean) => void = () => {};
  const runtime: ReminderRuntime = {
    getUpcoming: vi.fn(async () => snapshot),
    getPast: vi.fn(async () => ({ ...snapshot, value: { items: [], nextCursor: null } })),
    getList: vi.fn(async () => snapshot),
    getById: vi.fn(async () => ({ ...snapshot, value: reminder })),
    record: vi.fn(async () => ({ ...snapshot, value: reminder })),
    update: vi.fn(async () => ({ ...snapshot, value: { ...reminder, revision: 2 } })),
    delete: vi.fn(async () => ({ ...snapshot, value: null })),
    checkMutation: vi.fn(async () => ({ ...snapshot, value: { status: 'success' as const } })),
  };
  const notifications: ReminderNotificationsRuntime = {
    getPermissionStatus: vi.fn(async () => 'undetermined' as const),
    reconcile: vi.fn(async () => ({ status: 'permission-unavailable' as const, permission: 'undetermined' as const, desiredCount: 1, scheduledCount: 0 })),
    requestPermission: vi.fn(async () => ({ permission: 'denied' as const, reconciliation: {
      status: 'permission-unavailable' as const, permission: 'denied' as const, desiredCount: 1, scheduledCount: 0,
    } })),
  };
  const selection = { scope, getVersion: () => version, isChanging: () => false,
    subscribe: (next: typeof listener) => { listener = next; return vi.fn(); } };
  const controller = createReminderController(runtime, notifications, selection, () => now);
  controller.connect(); controller.subscribe(vi.fn()); const blur = controller.focus();
  return { runtime, notifications, selection, controller, blur,
    switchChild() { ++version; listener(true); listener(false); } };
}
async function ready() {
  const f = fixture(); await flush();
  f.controller.changeDraft({ title: 'Ny', date: { year: 2026, month: 10, day: 11 },
    time: { hour: 12, minute: 0 } }, context);
  return f;
}

describe('Reminder presentation lifecycle and safety', () => {
  it('loads bounded upcoming and past lists without requesting notification permission', async () => {
    const f = await ready();
    expect(f.controller.state.status).toBe('ready');
    expect(f.controller.state.upcoming?.value.items).toEqual([reminder]);
    expect(f.runtime.getUpcoming).toHaveBeenCalledWith();
    expect(f.runtime.getPast).toHaveBeenCalledWith();
    expect(f.notifications.requestPermission).not.toHaveBeenCalled();
  });

  it('creates once, prevents duplicate taps, and refreshes canonical lists', async () => {
    const f = await ready();
    const pending = deferred<typeof mutationSnapshot>();
    vi.mocked(f.runtime.record).mockReturnValueOnce(pending.promise);
    const first = f.controller.save(); await f.controller.save();
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
    pending.resolve(mutationSnapshot); await first;
    expect(f.controller.state.feedback).toBe('saved');
    expect(f.controller.state.draft.title).toBe('');
    expect(f.runtime.getUpcoming).toHaveBeenCalledTimes(2);
  });

  it('keeps invalid and non-future forms local and editable', async () => {
    const f = await ready();
    f.controller.changeDraft({ title: '', date: null }, context);
    await f.controller.save();
    expect(f.runtime.record).not.toHaveBeenCalled();
    expect(f.controller.state.fields).toMatchObject({ title: 'required', date: 'required' });
  });

  it('edits with the exact expected revision and normalized values', async () => {
    const f = await ready(); f.controller.edit(reminder);
    f.controller.changeDraft({ title: ' Ändrad ' }, context);
    await f.controller.save();
    expect(f.runtime.update).toHaveBeenCalledWith(context, reminder, expect.objectContaining({ title: 'Ändrad' }));
  });

  it('preserves uncertain attempts and checks status without replaying writes', async () => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new ReminderApplicationError('mutation-outcome-uncertain', reminder));
    await f.controller.save(); await f.controller.save();
    expect(f.runtime.record).toHaveBeenCalledTimes(1);
    expect(f.controller.state.pending).toEqual({ action: 'record', attempt: reminder, expected: undefined });
    await f.controller.checkStatus();
    expect(f.runtime.checkMutation).toHaveBeenCalledWith(context, { action: 'record', attempt: reminder, expected: undefined });
  });

  it('preserves an uncertain attempt across reminder-route blur and refocus', async () => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new ReminderApplicationError('mutation-outcome-uncertain', reminder));
    await f.controller.save();
    f.blur();
    f.controller.focus();
    await flush();
    expect(f.controller.state.pending).toEqual({ action: 'record', attempt: reminder, expected: undefined });
    expect(f.runtime.record).toHaveBeenCalledOnce();
  });

  it('requires a single-use exact delete confirmation', async () => {
    const f = await ready(); const confirm = f.controller.prepareDeleteConfirmation(reminder)!;
    await confirm(); await confirm();
    expect(f.runtime.delete).toHaveBeenCalledTimes(1);
    expect(f.runtime.delete).toHaveBeenCalledWith(expect.objectContaining(context), reminder);
  });

  it('invalidates delete confirmations after A to B to A, blur, unmount, and runtime replacement', async () => {
    const switched = await ready(); const afterSwitch = switched.controller.prepareDeleteConfirmation(reminder)!;
    switched.switchChild(); switched.switchChild(); await flush(); await afterSwitch();
    expect(switched.runtime.delete).not.toHaveBeenCalled();

    const blurred = await ready(); const afterBlur = blurred.controller.prepareDeleteConfirmation(reminder)!;
    blurred.blur(); blurred.controller.focus(); await flush(); await afterBlur();
    expect(blurred.runtime.delete).not.toHaveBeenCalled();

    const disposed = await ready(); const afterDispose = disposed.controller.prepareDeleteConfirmation(reminder)!;
    disposed.controller.dispose(); const replacement = await ready(); await afterDispose();
    expect(disposed.runtime.delete).not.toHaveBeenCalled();
    expect(replacement.runtime.delete).not.toHaveBeenCalled();
  });

  it('paginates each list through its runtime-issued cursor and deduplicates results', async () => {
    const f = await ready();
    const cursor = Object.freeze({}) as NonNullable<typeof snapshot.value.nextCursor>;
    vi.mocked(f.runtime.getUpcoming).mockResolvedValueOnce({ ...snapshot, value: { items: [reminder], nextCursor: cursor } });
    await f.controller.refresh();
    vi.mocked(f.runtime.getUpcoming).mockResolvedValueOnce({ ...snapshot, value: { items: [reminder], nextCursor: null } });
    await f.controller.loadMore('upcoming');
    expect(f.runtime.getUpcoming).toHaveBeenLastCalledWith(20, cursor);
    expect(f.controller.state.upcoming?.value.items).toEqual([reminder]);
  });

  it('paginates past reminders only through the past runtime cursor', async () => {
    const f = await ready();
    const pastReminder = createReminder({ ...reminder, id: 'past', scheduledAtEpochMs: now - 60_000 });
    const cursor = Object.freeze({}) as NonNullable<typeof snapshot.value.nextCursor>;
    vi.mocked(f.runtime.getPast).mockResolvedValueOnce({ ...snapshot, value: { items: [pastReminder], nextCursor: cursor } });
    await f.controller.refresh();
    vi.mocked(f.runtime.getPast).mockResolvedValueOnce({ ...snapshot, value: { items: [pastReminder], nextCursor: null } });
    await f.controller.loadMore('past');
    expect(f.runtime.getPast).toHaveBeenLastCalledWith(20, cursor);
    expect(f.runtime.getUpcoming).not.toHaveBeenLastCalledWith(20, cursor);
    expect(f.controller.state.past?.value.items).toEqual([pastReminder]);
  });

  it('requests permission only after the explicit action and represents denied/degraded globally', async () => {
    const f = await ready();
    expect(f.notifications.requestPermission).not.toHaveBeenCalled();
    await f.controller.requestNotifications();
    expect(f.notifications.requestPermission).toHaveBeenCalledOnce();
    expect(f.controller.state.notificationPermission).toBe('denied');
    vi.mocked(f.notifications.requestPermission).mockResolvedValueOnce({ permission: 'authorized', reconciliation: {
      status: 'degraded', permission: 'authorized', desiredCount: 2, scheduledCount: 1,
    } });
    await f.controller.requestNotifications();
    expect(f.controller.state.notificationReconciliation?.status).toBe('degraded');
  });

  it('clears stale child data/forms immediately and ignores late async results', async () => {
    const f = await ready(); const late = deferred<typeof snapshot>();
    vi.mocked(f.runtime.getUpcoming).mockReturnValueOnce(late.promise);
    const refresh = f.controller.refresh(); f.switchChild();
    expect(f.controller.state.upcoming).toBeNull(); expect(f.controller.state.draft.title).toBe('');
    late.resolve(snapshot); await refresh;
    expect(f.controller.state.upcoming).toBeNull();
  });

  it('recognizes a completed mutation after stale context without duplicating it', async () => {
    const f = await ready();
    vi.mocked(f.runtime.record).mockRejectedValueOnce(new ReminderRuntimeError('stale-child-context', {
      action: 'record', reminder,
    }));
    await f.controller.save();
    expect(f.controller.state.feedback).toBe('saved');
    expect(f.runtime.record).toHaveBeenCalledOnce();
  });
});
