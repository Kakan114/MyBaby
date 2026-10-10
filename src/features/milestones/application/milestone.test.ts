import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { Child } from '../../children/domain/child';
import {
  checkMilestoneMutation,
  deleteMilestone,
  MilestoneApplicationError,
  readMilestoneById,
  readMilestoneHistory,
  recordMilestone,
  updateMilestone,
  type MilestoneValues,
} from './milestone';
import type { MilestoneRepository } from './milestone-repository';
import { createMilestoneEntry, type MilestoneEntry } from '../domain/milestone-entry';

const birth = createCalendarDate('2026-01-01');
const today = createCalendarDate('2026-10-08');
const child: Child = { id: 'child', displayName: 'Mio', dateOfBirth: birth };
const predefinedValues: MilestoneValues = {
  subject: { kind: 'predefined', definitionId: 'social.first-smile' },
  occurredOn: createCalendarDate('2026-03-01'),
  note: null,
};
const original = createMilestoneEntry({
  ...predefinedValues,
  id: 'milestone-id',
  childId: child.id,
  revision: 1,
});
const editedValues: MilestoneValues = {
  subject: { kind: 'custom', title: 'Första utflykten' },
  occurredOn: createCalendarDate('2026-03-02'),
  note: 'En fin dag.',
};
const replacement = createMilestoneEntry({
  ...editedValues,
  id: original.id,
  childId: child.id,
  revision: 2,
});

function repository(overrides: Partial<MilestoneRepository> = {}): MilestoneRepository {
  return {
    create: vi.fn(async () => undefined),
    getById: vi.fn(async () => original),
    listHistory: vi.fn(async () => ({ items: [original], nextCursor: null })),
    updateIfMatches: vi.fn(async () => true),
    deleteIfMatches: vi.fn(async () => true),
    ...overrides,
  };
}

describe('Milestone application operations', () => {
  it('records predefined and custom milestones with one generated ID and optional notes', async () => {
    const create = vi.fn(async () => undefined);
    const generate = vi.fn(() => 'generated-id');
    const repo = repository({ create });
    const predefined = await recordMilestone(repo, { generate }, child, today, predefinedValues);
    expect(predefined).toMatchObject({
      id: 'generated-id', childId: child.id, revision: 1,
      subject: predefinedValues.subject, note: null,
    });
    const custom = await recordMilestone(
      repo,
      { generate },
      child,
      today,
      { ...editedValues, note: '  En fin dag.  ' },
    );
    expect(custom).toMatchObject({
      subject: { kind: 'custom', title: 'Första utflykten' },
      note: 'En fin dag.',
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('accepts the exact birth date and today without changing either calendar day', async () => {
    const create = vi.fn(async () => undefined);
    const repo = repository({ create });
    await expect(recordMilestone(repo, { generate: () => 'birth' }, child, today, {
      ...predefinedValues, occurredOn: birth,
    })).resolves.toMatchObject({ occurredOn: birth });
    await expect(recordMilestone(repo, { generate: () => 'today' }, child, today, {
      ...predefinedValues, occurredOn: today,
    })).resolves.toMatchObject({ occurredOn: today });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['2025-12-31', 'milestone-before-birth'],
    ['2026-10-09', 'future-milestone'],
  ] as const)('rejects ineligible occurrence date %s before writing', async (date, code) => {
    const create = vi.fn(async () => undefined);
    await expect(recordMilestone(repository({ create }), { generate: () => 'id' }, child, today, {
      ...predefinedValues, occurredOn: createCalendarDate(date),
    })).rejects.toMatchObject({ code });
    expect(create).not.toHaveBeenCalled();
  });

  it('treats a thrown create followed by the exact canonical entry as confirmed success', async () => {
    let attempt: MilestoneEntry | null = null;
    const create = vi.fn(async (entry: MilestoneEntry) => {
      attempt = entry;
      throw new Error('ambiguous native result');
    });
    const getById = vi.fn(async () => attempt);
    const result = await recordMilestone(
      repository({ create, getById }),
      { generate: () => 'stable-id' },
      child,
      today,
      predefinedValues,
    );
    expect(result.id).toBe('stable-id');
    expect(create).toHaveBeenCalledOnce();
    expect(getById).toHaveBeenCalledExactlyOnceWith(child.id, 'stable-id');
  });

  it('preserves the exact create attempt when canonical read proves it was not saved', async () => {
    const create = vi.fn(async () => { throw new Error('ambiguous'); });
    const getById = vi.fn(async () => null);
    const error = await recordMilestone(
      repository({ create, getById }),
      { generate: () => 'stable-id' },
      child,
      today,
      editedValues,
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: 'create-not-saved',
      pendingEntry: { id: 'stable-id', childId: child.id, ...editedValues },
    });
    expect(create).toHaveBeenCalledOnce();
    expect(getById).toHaveBeenCalledOnce();
  });

  it('classifies unreadable or conflicting create reconciliation as uncertain without replay', async () => {
    const create = vi.fn(async () => { throw new Error('ambiguous'); });
    const unreadable = repository({
      create,
      getById: vi.fn(async () => { throw new Error('read failed'); }),
    });
    await expect(recordMilestone(
      unreadable, { generate: () => 'id' }, child, today, predefinedValues,
    )).rejects.toMatchObject({ code: 'mutation-outcome-uncertain', pendingEntry: { id: 'id' } });
    expect(create).toHaveBeenCalledOnce();

    const conflictCreate = vi.fn(async () => { throw new Error('ambiguous'); });
    await expect(recordMilestone(repository({
      create: conflictCreate,
      getById: vi.fn(async () => ({ ...original, id: 'id', note: 'Different' })),
    }), { generate: () => 'id' }, child, today, predefinedValues))
      .rejects.toMatchObject({ code: 'mutation-outcome-uncertain' });
    expect(conflictCreate).toHaveBeenCalledOnce();
  });

  it('updates by expected revision and increments exactly once', async () => {
    const updateIfMatches = vi.fn(async () => true);
    const result = await updateMilestone(
      repository({ updateIfMatches }), child, today, original, editedValues,
    );
    expect(result).toEqual(replacement);
    expect(updateIfMatches).toHaveBeenCalledExactlyOnceWith(original, replacement);
  });

  it('rejects stale, missing, and foreign expected updates before mutation', async () => {
    const updateIfMatches = vi.fn(async () => true);
    await expect(updateMilestone(repository({
      updateIfMatches,
      getById: vi.fn(async () => ({ ...original, revision: 2 })),
    }), child, today, original, editedValues)).rejects.toMatchObject({ code: 'revision-conflict' });
    await expect(updateMilestone(repository({
      updateIfMatches,
      getById: vi.fn(async () => null),
    }), child, today, original, editedValues)).rejects.toMatchObject({ code: 'milestone-not-found' });
    await expect(updateMilestone(
      repository({ updateIfMatches }), child, today, { ...original, childId: 'other' }, editedValues,
    )).rejects.toMatchObject({ code: 'revision-conflict' });
    expect(updateIfMatches).not.toHaveBeenCalled();
  });

  it.each([
    ['unchanged', 'update-not-applied'],
    ['newer', 'revision-conflict'],
    ['missing', 'milestone-not-found'],
  ] as const)('classifies a known failed CAS with canonical state %s', async (state, code) => {
    const updateIfMatches = vi.fn(async () => false);
    const getById = vi.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(
        state === 'unchanged' ? original :
          state === 'newer' ? { ...replacement, revision: 3 } : null,
      );
    await expect(updateMilestone(
      repository({ updateIfMatches, getById }), child, today, original, editedValues,
    )).rejects.toMatchObject({ code });
    expect(updateIfMatches).toHaveBeenCalledOnce();
  });

  it('confirms an ambiguously returned update by exact canonical replacement without replay', async () => {
    const updateIfMatches = vi.fn(async () => { throw new Error('ambiguous'); });
    const getById = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(replacement);
    await expect(updateMilestone(
      repository({ updateIfMatches, getById }), child, today, original, editedValues,
    )).resolves.toEqual(replacement);
    expect(updateIfMatches).toHaveBeenCalledOnce();
  });

  it('preserves an uncertain update attempt when read-back cannot prove the outcome', async () => {
    const updateIfMatches = vi.fn(async () => { throw new Error('ambiguous'); });
    const getById = vi.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({ ...replacement, note: 'Different payload' });
    await expect(updateMilestone(
      repository({ updateIfMatches, getById }), child, today, original, editedValues,
    )).rejects.toMatchObject({
      code: 'mutation-outcome-uncertain', pendingEntry: replacement,
    });
    expect(updateIfMatches).toHaveBeenCalledOnce();
  });

  it('deletes one exact expected revision and reconciles known outcomes without replay', async () => {
    const success = vi.fn(async () => true);
    await expect(deleteMilestone(repository({ deleteIfMatches: success }), child, original))
      .resolves.toBeUndefined();
    expect(success).toHaveBeenCalledExactlyOnceWith(original);

    const ambiguous = vi.fn(async () => { throw new Error('ambiguous'); });
    const getById = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(null);
    await expect(deleteMilestone(
      repository({ deleteIfMatches: ambiguous, getById }), child, original,
    )).resolves.toBeUndefined();
    expect(ambiguous).toHaveBeenCalledOnce();
  });

  it.each([
    ['unchanged', 'delete-not-applied'],
    ['newer', 'revision-conflict'],
  ] as const)('classifies delete conflict state %s', async (state, code) => {
    const remove = vi.fn(async () => false);
    const getById = vi.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(state === 'unchanged' ? original : { ...original, revision: 2 });
    await expect(deleteMilestone(
      repository({ deleteIfMatches: remove, getById }), child, original,
    )).rejects.toMatchObject({ code });
    expect(remove).toHaveBeenCalledOnce();
  });

  it('preserves an uncertain delete attempt when read-back cannot prove the outcome', async () => {
    const remove = vi.fn(async () => { throw new Error('ambiguous'); });
    const getById = vi.fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({ ...original, note: 'Different payload' });
    await expect(deleteMilestone(
      repository({ deleteIfMatches: remove, getById }), child, original,
    )).rejects.toMatchObject({
      code: 'mutation-outcome-uncertain', pendingEntry: original,
    });
    expect(remove).toHaveBeenCalledOnce();
  });

  it('checks pending mutations read-only and never invokes a write', async () => {
    const create = vi.fn(async () => { throw new Error('unexpected write'); });
    const updateIfMatches = vi.fn(async () => { throw new Error('unexpected write'); });
    const deleteIfMatches = vi.fn(async () => { throw new Error('unexpected write'); });
    const getById = vi.fn(async () => replacement);
    const repo = repository({ create, updateIfMatches, deleteIfMatches, getById });
    await expect(checkMilestoneMutation(repo, {
      action: 'update', attempt: replacement, expected: original,
    })).resolves.toEqual({ status: 'success' });
    expect(getById).toHaveBeenCalledExactlyOnceWith(child.id, original.id);
    expect(create).not.toHaveBeenCalled();
    expect(updateIfMatches).not.toHaveBeenCalled();
    expect(deleteIfMatches).not.toHaveBeenCalled();
  });

  it('returns all read-only mutation status classifications', async () => {
    await expect(checkMilestoneMutation(repository({ getById: vi.fn(async () => null) }), {
      action: 'record', attempt: original,
    })).resolves.toEqual({ status: 'not-applied' });
    await expect(checkMilestoneMutation(repository({ getById: vi.fn(async () => null) }), {
      action: 'delete', attempt: original, expected: original,
    })).resolves.toEqual({ status: 'success' });
    await expect(checkMilestoneMutation(repository({ getById: vi.fn(async () => original) }), {
      action: 'delete', attempt: original, expected: original,
    })).resolves.toEqual({ status: 'not-applied' });
    await expect(checkMilestoneMutation(repository({
      getById: vi.fn(async () => ({ ...replacement, revision: 3 })),
    }), { action: 'update', attempt: replacement, expected: original }))
      .resolves.toEqual({ status: 'conflict' });
    await expect(checkMilestoneMutation(repository({
      getById: vi.fn(async () => ({ ...replacement, note: 'Different' })),
    }), { action: 'update', attempt: replacement, expected: original }))
      .resolves.toEqual({ status: 'uncertain' });
  });

  it('sanitizes repository read failures into stable application errors', async () => {
    const failure = vi.fn(async () => { throw new Error('raw SQLite detail'); });
    await expect(readMilestoneById(repository({ getById: failure }), child.id, 'id'))
      .rejects.toEqual(new MilestoneApplicationError('local-data-unavailable'));
    await expect(readMilestoneHistory(repository({ listHistory: failure }), child.id, 20))
      .rejects.toEqual(new MilestoneApplicationError('local-data-unavailable'));
  });
});
