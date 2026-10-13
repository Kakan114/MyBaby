import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { ReminderRepository } from '../application/reminder-repository';
import { createReminder } from '../domain/reminder';
import { createReminderRuntime } from './create-reminder-runtime';

const now = 1_800_000_000_000;
const childA = { id: 'a', displayName: 'A', dateOfBirth: createCalendarDate('2026-01-01') };
const childB = { id: 'b', displayName: 'B', dateOfBirth: createCalendarDate('2026-01-01') };
const existing = createReminder({
  id: 'existing', childId: 'a', title: 'BVC', scheduledAtEpochMs: now + 60_000, revision: 1,
});
const scope = {};

function fixture() {
  let active = childA;
  let version = 0;
  let changing = false;
  let currentNow = now;
  const repository: ReminderRepository = {
    create: vi.fn(async () => undefined),
    getById: vi.fn(async (childId, id) =>
      childId === existing.childId && id === existing.id ? existing : null),
    listByChild: vi.fn(async () => ({ items: [existing], nextCursor: null })),
    listUpcomingByChild: vi.fn(async (_childId, _after, limit) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('bad limit');
      return { items: [existing], nextCursor: null };
    }),
    listPastByChild: vi.fn(async (_childId, _before, limit) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('bad limit');
      return { items: [], nextCursor: null };
    }),
    updateIfMatches: vi.fn(async () => true),
    deleteIfMatches: vi.fn(async () => true),
  };
  const queue = vi.fn();
  const operation = vi.fn();
  const selection = {
    scope,
    getVersion: () => version,
    isChanging: () => changing,
    subscribe: () => () => {},
  };
  const runtime = createReminderRuntime({
    runOperation: async (run) => { operation(); return run(); },
    withDatabaseQueue: async (run) => { queue(); return run(); },
    selection,
    idGenerator: { generate: () => 'generated' },
    getCurrentEpochMs: () => currentNow,
    initialize: async () => ({
      childRepository: {
        getById: async (id) => id === active.id ? active : null,
        hasChildren: async () => true,
        listChildren: async () => [childA, childB],
        save: async () => undefined,
      },
      activeChildRepository: {
        getActiveChildId: async () => active.id,
        setActiveChildId: async () => undefined,
        setActiveChildIdIfUnset: async () => undefined,
        clearActiveChildIdIfMatches: async () => undefined,
      },
      reminderRepository: repository,
    }),
  });
  return {
    runtime, repository, queue, operation,
    context: { childId: 'a', selectionVersion: 0, selectionScope: scope },
    switchTo(child: typeof childA) { active = child; version += 1; },
    setChanging(value: boolean) { changing = value; },
    setNow(value: number) { currentNow = value; },
  };
}

describe('Reminder feature runtime', () => {
  it('acquires operation and shared database queue exactly once per public operation', async () => {
    const f = fixture();
    const created = (await f.runtime.record(f.context, {
      title: 'Ny', scheduledAtEpochMs: now + 1,
    })).value;
    await f.runtime.getList();
    await f.runtime.getUpcoming();
    await f.runtime.getPast();
    await f.runtime.getById(f.context, existing.id);
    const updated = (await f.runtime.update(f.context, existing, {
      title: 'Ändrad', scheduledAtEpochMs: now + 2,
    })).value;
    await f.runtime.checkMutation(f.context, {
      action: 'update', expected: existing, attempt: updated,
    });
    await f.runtime.delete(f.context, existing);
    expect(created.id).toBe('generated');
    expect(f.queue).toHaveBeenCalledTimes(8);
    expect(f.operation).toHaveBeenCalledTimes(8);
  });

  it('keeps mutation checks read-only', async () => {
    const f = fixture();
    expect((await f.runtime.checkMutation(f.context, {
      action: 'record', attempt: existing,
    })).value.status).toBe('success');
    expect(f.repository.create).not.toHaveBeenCalled();
    expect(f.repository.updateIfMatches).not.toHaveBeenCalled();
    expect(f.repository.deleteIfMatches).not.toHaveBeenCalled();
  });

  it('rejects stale context after A to B and A to B to A transitions', async () => {
    const f = fixture();
    f.switchTo(childB);
    await expect(f.runtime.getById(f.context, existing.id))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    f.switchTo(childA);
    await expect(f.runtime.getById(f.context, existing.id))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.getById).not.toHaveBeenCalled();
  });

  it('rejects a stale or foreign pagination cursor', async () => {
    const f = fixture();
    await expect(f.runtime.getList(f.context, 20, {
      childId: 'b', scheduledAtEpochMs: now + 1, id: 'foreign',
    })).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.listByChild).not.toHaveBeenCalled();
  });

  it('keeps an opaque upcoming time boundary stable across pages and clock changes', async () => {
    const f = fixture();
    vi.mocked(f.repository.listUpcomingByChild)
      .mockResolvedValueOnce({
        items: [existing],
        nextCursor: { childId: childA.id, scheduledAtEpochMs: now + 60_000, id: existing.id },
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    const first = await f.runtime.getUpcoming(1);
    expect(first.value.nextCursor).not.toBeNull();
    f.setNow(now + 3_600_000);
    await f.runtime.getUpcoming(1, first.value.nextCursor);

    expect(f.repository.listUpcomingByChild).toHaveBeenNthCalledWith(1, childA.id, now, 1, null);
    expect(f.repository.listUpcomingByChild).toHaveBeenNthCalledWith(2, childA.id, now, 1, {
      childId: childA.id,
      scheduledAtEpochMs: now + 60_000,
      id: existing.id,
    });
  });

  it('keeps an opaque past time boundary stable across pages and clock changes', async () => {
    const f = fixture();
    const past = createReminder({
      ...existing, id: 'past', scheduledAtEpochMs: now,
    });
    vi.mocked(f.repository.listPastByChild)
      .mockResolvedValueOnce({
        items: [past],
        nextCursor: { childId: childA.id, scheduledAtEpochMs: now, id: past.id },
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    const first = await f.runtime.getPast(1);
    f.setNow(now - 3_600_000);
    await f.runtime.getPast(1, first.value.nextCursor);

    expect(f.repository.listPastByChild).toHaveBeenNthCalledWith(1, childA.id, now, 1, null);
    expect(f.repository.listPastByChild).toHaveBeenNthCalledWith(2, childA.id, now, 1, {
      childId: childA.id,
      scheduledAtEpochMs: now,
      id: past.id,
    });
  });

  it('invalidates pagination cursors after A to B to A and across runtime instances', async () => {
    const f = fixture();
    vi.mocked(f.repository.listUpcomingByChild).mockResolvedValueOnce({
      items: [existing],
      nextCursor: { childId: childA.id, scheduledAtEpochMs: now + 60_000, id: existing.id },
    });
    const cursor = (await f.runtime.getUpcoming(1)).value.nextCursor;
    expect(cursor).not.toBeNull();

    f.switchTo(childB);
    f.switchTo(childA);
    await expect(f.runtime.getUpcoming(1, cursor))
      .rejects.toMatchObject({ code: 'stale-child-context' });

    const replacement = fixture();
    await expect(replacement.runtime.getUpcoming(1, cursor))
      .rejects.toMatchObject({ code: 'invalid-pagination-cursor' });
    expect(replacement.repository.listUpcomingByChild).not.toHaveBeenCalled();
  });

  it('does not publish a list that completed after an active-child transition', async () => {
    const f = fixture();
    vi.mocked(f.repository.listPastByChild).mockImplementationOnce(async () => {
      f.switchTo(childB);
      return { items: [], nextCursor: null };
    });
    await expect(f.runtime.getPast())
      .rejects.toMatchObject({ code: 'stale-child-context' });
  });

  it('rejects incompatible and malformed opaque cursors before reading', async () => {
    const f = fixture();
    vi.mocked(f.repository.listUpcomingByChild).mockResolvedValueOnce({
      items: [existing],
      nextCursor: { childId: childA.id, scheduledAtEpochMs: now + 60_000, id: existing.id },
    });
    const cursor = (await f.runtime.getUpcoming(1)).value.nextCursor;
    await expect(f.runtime.getPast(1, cursor))
      .rejects.toMatchObject({ code: 'invalid-pagination-cursor' });
    await expect(f.runtime.getUpcoming(1, 'forged' as never))
      .rejects.toMatchObject({ code: 'invalid-pagination-cursor' });
    expect(f.repository.listPastByChild).not.toHaveBeenCalled();
  });

  it('uses dedicated bounded queries and enforces the repository page-size ceiling', async () => {
    const f = fixture();
    await f.runtime.getUpcoming();
    await f.runtime.getPast();
    expect(f.repository.listByChild).not.toHaveBeenCalled();
    expect(f.repository.listUpcomingByChild).toHaveBeenCalledWith(childA.id, now, 20, null);
    expect(f.repository.listPastByChild).toHaveBeenCalledWith(childA.id, now, 20, null);

    await expect(f.runtime.getUpcoming(101)).rejects.toMatchObject({
      code: 'local-data-unavailable',
    });
    await expect(f.runtime.getPast(0)).rejects.toMatchObject({
      code: 'local-data-unavailable',
    });
  });

  it('rejects contexts from a replaced runtime scope', async () => {
    const f = fixture();
    await expect(f.runtime.getById({ ...f.context, selectionScope: {} }, existing.id))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.getById).not.toHaveBeenCalled();
  });

  it('revalidates a mutation queued before an active-child change', async () => {
    const f = fixture();
    const pending = f.runtime.record(f.context, {
      title: 'Ny', scheduledAtEpochMs: now + 1,
    });
    f.switchTo(childB);
    await expect(pending).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.create).not.toHaveBeenCalled();
  });

  it('captures selection-changing state before the first asynchronous boundary', async () => {
    const f = fixture();
    f.setChanging(true);
    const promise = f.runtime.getList();
    f.setChanging(false);
    await expect(promise).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.listByChild).not.toHaveBeenCalled();
  });

  it('reports a completed mutation if context changes after the write', async () => {
    const f = fixture();
    vi.mocked(f.repository.create).mockImplementationOnce(async () => { f.switchTo(childB); });
    await expect(f.runtime.record(f.context, {
      title: 'Ny', scheduledAtEpochMs: now + 1,
    })).rejects.toMatchObject({
      code: 'stale-child-context',
      completedMutation: { action: 'record', reminder: { id: 'generated', childId: 'a' } },
    });
  });

  it('preserves validation errors and sanitizes unknown failures', async () => {
    const f = fixture();
    await expect(f.runtime.record(f.context, {
      title: ' ', scheduledAtEpochMs: now + 1,
    })).rejects.toMatchObject({ code: 'invalid-title' });
    vi.mocked(f.repository.listByChild).mockRejectedValueOnce(new Error('raw SQLite path'));
    const error = await f.runtime.getList().catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('SQLite path');
  });

  it('sanitizes injected ID-generator failures without exposing native details', async () => {
    const f = fixture();
    const runtime = createReminderRuntime({
      runOperation: async (run) => run(),
      withDatabaseQueue: async (run) => run(),
      selection: { scope, getVersion: () => 0, isChanging: () => false, subscribe: () => () => {} },
      idGenerator: { generate: () => { throw new Error('raw native UUID failure'); } },
      getCurrentEpochMs: () => now,
      initialize: async () => ({
        childRepository: { getById: async () => childA, hasChildren: async () => true, listChildren: async () => [childA], save: async () => undefined },
        activeChildRepository: { getActiveChildId: async () => childA.id, setActiveChildId: async () => undefined, setActiveChildIdIfUnset: async () => undefined, clearActiveChildIdIfMatches: async () => undefined },
        reminderRepository: f.repository,
      }),
    });
    const error = await runtime.record(f.context, {
      title: 'Ny', scheduledAtEpochMs: now + 1,
    }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('native UUID');
  });
});
