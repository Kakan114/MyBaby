import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { ReminderRepository } from './reminder-repository';
import {
  checkReminderMutation,
  deleteReminder,
  readReminderById,
  readReminderList,
  readPastReminders,
  readUpcomingReminders,
  recordReminder,
  updateReminder,
} from './reminder';
import { createReminder, type Reminder } from '../domain/reminder';

const now = 1_800_000_000_000;
const child = Object.freeze({
  id: 'child-a',
  displayName: 'Mio',
  dateOfBirth: createCalendarDate('2026-01-01'),
});

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return createReminder({
    id: 'reminder-1', childId: child.id, title: 'BVC',
    scheduledAtEpochMs: now + 60_000, revision: 1, ...overrides,
  });
}

function fixture(initial: readonly Reminder[] = []) {
  const items = new Map(initial.map((item) => [item.id, item]));
  const repository: ReminderRepository = {
    create: vi.fn(async (item) => {
      if (items.has(item.id)) throw new Error('duplicate');
      items.set(item.id, item);
    }),
    getById: vi.fn(async (childId, id) => {
      const item = items.get(id);
      return item !== undefined && item.childId === childId ? item : null;
    }),
    listByChild: vi.fn(async (childId, limit) => ({
      items: [...items.values()].filter((item) => item.childId === childId).slice(0, limit),
      nextCursor: null,
    })),
    listUpcomingByChild: vi.fn(async (childId, afterEpochMs, limit) => ({
      items: [...items.values()].filter((item) =>
        item.childId === childId && item.scheduledAtEpochMs > afterEpochMs).slice(0, limit),
      nextCursor: null,
    })),
    listPastByChild: vi.fn(async (childId, atOrBeforeEpochMs, limit) => ({
      items: [...items.values()].filter((item) =>
        item.childId === childId && item.scheduledAtEpochMs <= atOrBeforeEpochMs).slice(0, limit),
      nextCursor: null,
    })),
    updateIfMatches: vi.fn(async (expected, replacement) => {
      const current = items.get(expected.id);
      if (current === undefined || current.revision !== expected.revision || current.childId !== expected.childId) return false;
      items.set(replacement.id, replacement);
      return true;
    }),
    deleteIfMatches: vi.fn(async (expected) => {
      const current = items.get(expected.id);
      if (current === undefined || current.revision !== expected.revision || current.childId !== expected.childId) return false;
      items.delete(expected.id);
      return true;
    }),
  };
  return { repository, items };
}

describe('Reminder application operations', () => {
  it('creates a future reminder with runtime identity, child, revision and normalized title', async () => {
    const { repository } = fixture();
    const result = await recordReminder(
      repository,
      { generate: () => 'generated' },
      child,
      now,
      { title: '  BVC  ', scheduledAtEpochMs: now + 1 },
    );
    expect(result).toEqual({
      id: 'generated', childId: child.id, title: 'BVC',
      scheduledAtEpochMs: now + 1, revision: 1,
    });
  });

  it.each([now, now - 1])('rejects non-future create time %s', async (scheduledAtEpochMs) => {
    await expect(recordReminder(
      fixture().repository,
      { generate: () => 'generated' },
      child,
      now,
      { title: 'BVC', scheduledAtEpochMs },
    )).rejects.toMatchObject({ code: 'reminder-not-in-future' });
  });

  it('rejects an invalid injected clock as unavailable', async () => {
    await expect(recordReminder(
      fixture().repository,
      { generate: () => 'generated' },
      child,
      Number.NaN,
      { title: 'BVC', scheduledAtEpochMs: now + 1 },
    )).rejects.toMatchObject({ code: 'local-data-unavailable' });
  });

  it('updates with CAS and requires the resulting reminder to remain future', async () => {
    const original = reminder();
    const success = fixture([original]);
    const updated = await updateReminder(success.repository, child, now, original, {
      title: ' Ny tid ', scheduledAtEpochMs: now + 120_000,
    });
    expect(updated).toMatchObject({ title: 'Ny tid', revision: 2 });
    const invalid = fixture([original]);
    await expect(updateReminder(invalid.repository, child, now, original, {
      title: 'För sent', scheduledAtEpochMs: now,
    })).rejects.toMatchObject({ code: 'reminder-not-in-future' });
    expect(invalid.repository.updateIfMatches).not.toHaveBeenCalled();
  });

  it('reads expired reminders without treating them as delivered or deleting them', async () => {
    const expired = reminder({ scheduledAtEpochMs: now - 1 });
    const { repository, items } = fixture([expired]);
    expect(await readReminderById(repository, child.id, expired.id)).toEqual(expired);
    expect((await readReminderList(repository, child.id, 20)).items).toEqual([expired]);
    expect(items.get(expired.id)).toEqual(expired);
  });

  it('delegates bounded upcoming and past reads and sanitizes failures', async () => {
    const future = reminder({ id: 'future' });
    const past = reminder({ id: 'past', scheduledAtEpochMs: now });
    const { repository } = fixture([future, past]);
    await expect(readUpcomingReminders(repository, child.id, now, 20))
      .resolves.toMatchObject({ items: [{ id: 'future' }] });
    await expect(readPastReminders(repository, child.id, now, 20))
      .resolves.toMatchObject({ items: [{ id: 'past' }] });
    expect(repository.listUpcomingByChild).toHaveBeenCalledWith(child.id, now, 20, null);
    expect(repository.listPastByChild).toHaveBeenCalledWith(child.id, now, 20, null);

    vi.mocked(repository.listPastByChild).mockRejectedValueOnce(new Error('raw SQLite'));
    await expect(readPastReminders(repository, child.id, now, 20))
      .rejects.toMatchObject({ code: 'local-data-unavailable' });
  });

  it('rejects stale and foreign expected snapshots', async () => {
    const original = reminder();
    const { repository } = fixture([original]);
    await expect(updateReminder(repository, child, now, {
      ...original, revision: 2,
    }, { title: 'Ny', scheduledAtEpochMs: now + 2 })).rejects.toMatchObject({ code: 'revision-conflict' });
    await expect(deleteReminder(repository, child, {
      ...original, childId: 'child-b',
    })).rejects.toMatchObject({ code: 'revision-conflict' });
  });

  it('deletes only the exact expected revision', async () => {
    const original = reminder();
    const { repository, items } = fixture([original]);
    await deleteReminder(repository, child, original);
    expect(items.has(original.id)).toBe(false);
  });

  it('reconciles successful writes after ambiguous native errors without replaying', async () => {
    const { repository, items } = fixture();
    const create = vi.mocked(repository.create);
    create.mockImplementationOnce(async (entry) => {
      items.set(entry.id, entry);
      throw new Error('ambiguous');
    });
    const result = await recordReminder(
      repository, { generate: () => 'generated' }, child, now,
      { title: 'BVC', scheduledAtEpochMs: now + 1 },
    );
    expect(result.id).toBe('generated');
    expect(create).toHaveBeenCalledOnce();
  });

  it('classifies known create non-application and unreadable outcomes', async () => {
    const notSaved = fixture();
    vi.mocked(notSaved.repository.create).mockRejectedValueOnce(new Error('failed'));
    await expect(recordReminder(
      notSaved.repository, { generate: () => 'a' }, child, now,
      { title: 'BVC', scheduledAtEpochMs: now + 1 },
    )).rejects.toMatchObject({ code: 'create-not-saved', pendingReminder: { id: 'a' } });

    const uncertain = fixture();
    vi.mocked(uncertain.repository.create).mockRejectedValueOnce(new Error('failed'));
    vi.mocked(uncertain.repository.getById).mockRejectedValueOnce(new Error('read failed'));
    await expect(recordReminder(
      uncertain.repository, { generate: () => 'b' }, child, now,
      { title: 'BVC', scheduledAtEpochMs: now + 1 },
    )).rejects.toMatchObject({ code: 'mutation-outcome-uncertain', pendingReminder: { id: 'b' } });
  });

  it('checks pending create/update/delete by canonical read only', async () => {
    const original = reminder();
    const replacement = reminder({ title: 'Ny', revision: 2 });
    const { repository, items } = fixture([replacement]);
    expect(await checkReminderMutation(repository, { action: 'record', attempt: replacement }))
      .toEqual({ status: 'success' });
    expect(await checkReminderMutation(repository, {
      action: 'update', expected: original, attempt: replacement,
    })).toEqual({ status: 'success' });
    items.delete(original.id);
    expect(await checkReminderMutation(repository, {
      action: 'delete', expected: original, attempt: original,
    })).toEqual({ status: 'success' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateIfMatches).not.toHaveBeenCalled();
    expect(repository.deleteIfMatches).not.toHaveBeenCalled();
  });

  it('reconciles ambiguous update and delete without replaying either mutation', async () => {
    const original = reminder();
    const updateFixture = fixture([original]);
    const update = vi.mocked(updateFixture.repository.updateIfMatches);
    update.mockImplementationOnce(async (_expected, replacement) => {
      updateFixture.items.set(replacement.id, replacement);
      throw new Error('ambiguous update');
    });
    const updated = await updateReminder(updateFixture.repository, child, now, original, {
      title: 'Ny', scheduledAtEpochMs: now + 2,
    });
    expect(updated).toMatchObject({ title: 'Ny', revision: 2 });
    expect(update).toHaveBeenCalledOnce();

    const deleteFixture = fixture([updated]);
    const remove = vi.mocked(deleteFixture.repository.deleteIfMatches);
    remove.mockImplementationOnce(async (expected) => {
      deleteFixture.items.delete(expected.id);
      throw new Error('ambiguous delete');
    });
    await expect(deleteReminder(deleteFixture.repository, child, updated)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('classifies known non-application and CAS conflicts after mutation attempts', async () => {
    const original = reminder();
    const unchanged = fixture([original]);
    vi.mocked(unchanged.repository.updateIfMatches).mockRejectedValueOnce(new Error('failed'));
    await expect(updateReminder(unchanged.repository, child, now, original, {
      title: 'Ny', scheduledAtEpochMs: now + 2,
    })).rejects.toMatchObject({ code: 'update-not-applied', pendingReminder: { revision: 2 } });

    vi.mocked(unchanged.repository.deleteIfMatches).mockRejectedValueOnce(new Error('failed'));
    await expect(deleteReminder(unchanged.repository, child, original))
      .rejects.toMatchObject({ code: 'delete-not-applied', pendingReminder: original });

    const changed = reminder({ title: 'Annan', revision: 2 });
    const conflict = fixture([changed]);
    await expect(updateReminder(conflict.repository, child, now, original, {
      title: 'Ny', scheduledAtEpochMs: now + 2,
    })).rejects.toMatchObject({ code: 'revision-conflict' });
  });

  it('sanitizes repository read errors', async () => {
    const { repository } = fixture();
    vi.mocked(repository.listByChild).mockRejectedValueOnce(new Error('raw SQLite')); 
    await expect(readReminderList(repository, child.id, 20))
      .rejects.toMatchObject({ code: 'local-data-unavailable' });
  });
});
