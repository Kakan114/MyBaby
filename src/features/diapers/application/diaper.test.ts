import { describe, expect, it, vi } from 'vitest';
import type { DiaperEvent } from '../domain/diaper-event';
import {
  deleteDiaper,
  DiaperApplicationError,
  listRecentDiapers,
  recordDiaper,
  updateDiaper,
} from './diaper';

function fixture() {
  const rows: DiaperEvent[] = [];
  const repository = {
    save: vi.fn(async (event: DiaperEvent) => { rows.push(event); }),
    getById: vi.fn(async (childId: string, id: string) =>
      rows.find((row) => row.childId === childId && row.id === id) ?? null),
    listRecentByChildId: vi.fn(async () => rows),
    deleteIfMatches: vi.fn(async (expected: DiaperEvent) => {
      const index = rows.findIndex((row) => row.id === expected.id &&
        row.childId === expected.childId && row.occurredAtEpochMs === expected.occurredAtEpochMs &&
        row.kind === expected.kind);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    }),
    updateIfMatches: vi.fn(async (expected: DiaperEvent, replacement: DiaperEvent) => {
      const index = rows.findIndex((row) => row.id === expected.id &&
        row.childId === expected.childId && row.occurredAtEpochMs === expected.occurredAtEpochMs &&
        row.kind === expected.kind);
      if (index < 0) return false;
      rows[index] = replacement;
      return true;
    }),
  };
  return { rows, repository, idGenerator: { generate: () => 'event-id' } };
}

describe('diaper application', () => {
  it('records a validated event and owns the fixed history limit', async () => {
    const value = fixture();
    await expect(recordDiaper(value, 'child', 100, 100, 'mixed')).resolves.toEqual({
      id: 'event-id', childId: 'child', occurredAtEpochMs: 100, kind: 'mixed',
    });
    await listRecentDiapers(value.repository, 'child');
    expect(value.repository.listRecentByChildId).toHaveBeenCalledWith('child', 20);
  });
  it('rejects future historical values before writing', async () => {
    const value = fixture();
    await expect(recordDiaper(value, 'child', 101, 100, 'wet')).rejects.toMatchObject({
      code: 'future-diaper',
    });
    expect(value.repository.save).not.toHaveBeenCalled();
  });
  it('reconciles exact persisted success without a second insert', async () => {
    const value = fixture();
    value.repository.save.mockImplementationOnce(async (event) => {
      value.rows.push(event); throw new Error('uncertain');
    });
    await expect(recordDiaper(value, 'child', 100, 100, 'dirty')).resolves.toMatchObject({
      id: 'event-id', kind: 'dirty',
    });
    expect(value.repository.save).toHaveBeenCalledOnce();
  });
  it('distinguishes confirmed absence, reread failure, and mismatch', async () => {
    const absent = fixture();
    absent.repository.save.mockRejectedValueOnce(new Error('write'));
    await expect(recordDiaper(absent, 'child', 100, 100, 'wet')).rejects.toMatchObject({
      code: 'diaper-not-saved',
    });
    const unreadable = fixture();
    unreadable.repository.save.mockRejectedValueOnce(new Error('write'));
    unreadable.repository.getById.mockRejectedValueOnce(new Error('read'));
    await expect(recordDiaper(unreadable, 'child', 100, 100, 'wet')).rejects.toBeInstanceOf(DiaperApplicationError);
    const mismatch = fixture();
    mismatch.repository.save.mockRejectedValueOnce(new Error('write'));
    mismatch.repository.getById.mockResolvedValueOnce({
      id: 'event-id', childId: 'child', occurredAtEpochMs: 99, kind: 'wet',
    });
    await expect(recordDiaper(mismatch, 'child', 100, 100, 'wet')).rejects.toMatchObject({
      code: 'diaper-outcome-uncertain',
    });
  });

  it('conditionally deletes only the exact immutable event snapshot', async () => {
    const value = fixture();
    const original: DiaperEvent = {
      id: 'event', childId: 'child', occurredAtEpochMs: 100, kind: 'wet',
    };
    value.rows.push(original);
    await expect(deleteDiaper(value.repository, original)).resolves.toBeUndefined();
    expect(value.rows).toEqual([]);
    expect(value.repository.deleteIfMatches).toHaveBeenCalledOnce();

    value.rows.push({ ...original, kind: 'dirty' });
    await expect(deleteDiaper(value.repository, original)).rejects.toMatchObject({
      code: 'diaper-event-changed',
    });
    expect(value.rows).toEqual([{ ...original, kind: 'dirty' }]);
  });

  it('reconciles ambiguous delete without issuing a second delete', async () => {
    const deleted = fixture();
    const original: DiaperEvent = {
      id: 'event', childId: 'child', occurredAtEpochMs: 100, kind: 'mixed',
    };
    deleted.repository.deleteIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    await expect(deleteDiaper(deleted.repository, original)).resolves.toBeUndefined();
    expect(deleted.repository.deleteIfMatches).toHaveBeenCalledOnce();

    const retained = fixture();
    retained.rows.push(original);
    retained.repository.deleteIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    await expect(deleteDiaper(retained.repository, original)).rejects.toMatchObject({
      code: 'diaper-delete-not-applied',
    });
    expect(retained.repository.deleteIfMatches).toHaveBeenCalledOnce();

    const changed = fixture();
    changed.rows.push({ ...original, kind: 'wet' });
    changed.repository.deleteIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    await expect(deleteDiaper(changed.repository, original)).rejects.toMatchObject({
      code: 'diaper-mutation-outcome-uncertain',
    });

    const unreadable = fixture();
    unreadable.repository.deleteIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    unreadable.repository.getById.mockRejectedValueOnce(new Error('read failed'));
    await expect(deleteDiaper(unreadable.repository, original)).rejects.toMatchObject({
      code: 'diaper-mutation-outcome-uncertain',
    });
  });

  it('updates kind and time in place while preserving identity and ownership', async () => {
    const value = fixture();
    const original: DiaperEvent = {
      id: 'event', childId: 'child', occurredAtEpochMs: 100, kind: 'wet',
    };
    const replacement: DiaperEvent = { ...original, occurredAtEpochMs: 90, kind: 'mixed' };
    value.rows.push(original);
    await expect(updateDiaper(value.repository, original, replacement, 100)).resolves.toBeUndefined();
    expect(value.rows).toEqual([replacement]);

    await expect(updateDiaper(
      value.repository,
      replacement,
      { ...replacement, childId: 'other' },
      100,
    )).rejects.toMatchObject({ code: 'diaper-event-changed' });
    await expect(updateDiaper(
      value.repository,
      replacement,
      { ...replacement, occurredAtEpochMs: 101 },
      100,
    )).rejects.toMatchObject({ code: 'future-diaper' });
  });

  it('reconciles ambiguous update by exact desired, expected, or conflicting state', async () => {
    const original: DiaperEvent = {
      id: 'event', childId: 'child', occurredAtEpochMs: 100, kind: 'wet',
    };
    const replacement: DiaperEvent = { ...original, occurredAtEpochMs: 90, kind: 'dirty' };

    const applied = fixture();
    applied.rows.push(original);
    applied.repository.updateIfMatches.mockImplementationOnce(async () => {
      applied.rows[0] = replacement;
      throw new Error('ambiguous');
    });
    await expect(updateDiaper(applied.repository, original, replacement, 100)).resolves.toBeUndefined();
    expect(applied.repository.updateIfMatches).toHaveBeenCalledOnce();

    const retained = fixture();
    retained.rows.push(original);
    retained.repository.updateIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    await expect(updateDiaper(retained.repository, original, replacement, 100)).rejects.toMatchObject({
      code: 'diaper-update-not-applied',
    });

    const changed = fixture();
    changed.rows.push({ ...original, kind: 'mixed' });
    changed.repository.updateIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    await expect(updateDiaper(changed.repository, original, replacement, 100)).rejects.toMatchObject({
      code: 'diaper-mutation-outcome-uncertain',
    });

    const unreadable = fixture();
    unreadable.repository.updateIfMatches.mockRejectedValueOnce(new Error('ambiguous'));
    unreadable.repository.getById.mockRejectedValueOnce(new Error('read failed'));
    await expect(updateDiaper(unreadable.repository, original, replacement, 100))
      .rejects.toMatchObject({ code: 'diaper-mutation-outcome-uncertain' });
  });
});
