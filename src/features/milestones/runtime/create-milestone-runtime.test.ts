import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { MilestoneRepository } from '../application/milestone-repository';
import { createMilestoneEntry } from '../domain/milestone-entry';
import { createMilestoneRuntime } from './create-milestone-runtime';

const today = createCalendarDate('2026-10-08');
const child = { id: 'a', displayName: 'Child A', dateOfBirth: createCalendarDate('2026-01-01') };
const values = {
  subject: { kind: 'predefined', definitionId: 'social.first-smile' } as const,
  occurredOn: createCalendarDate('2026-03-01'),
  note: null,
};
const original = createMilestoneEntry({
  ...values, id: 'existing', childId: child.id, revision: 1,
});
const scope = {};
const context = { childId: child.id, selectionVersion: 0, selectionScope: scope };

function fixture(repositoryOverrides: Partial<MilestoneRepository> = {}) {
  const repository: MilestoneRepository = {
    create: vi.fn(async () => undefined),
    getById: vi.fn(async () => original),
    listHistory: vi.fn(async () => ({ items: [original], nextCursor: null })),
    updateIfMatches: vi.fn(async () => true),
    deleteIfMatches: vi.fn(async () => true),
    ...repositoryOverrides,
  };
  const queue = vi.fn();
  const operation = vi.fn();
  let nextId = 0;
  const runtime = createMilestoneRuntime({
    runOperation: async (run) => { operation(); return run(); },
    withDatabaseQueue: async (run) => { queue(); return run(); },
    selection: {
      scope,
      getVersion: () => 0,
      isChanging: () => false,
      subscribe: () => () => {},
    },
    idGenerator: { generate: () => `generated-${++nextId}` },
    getCurrentCalendarDate: () => today,
    initialize: async () => ({
      childRepository: {
        getById: async () => child,
        hasChildren: async () => true,
        listChildren: async () => [child],
        save: async () => undefined,
      },
      activeChildRepository: {
        getActiveChildId: async () => child.id,
        setActiveChildId: async () => undefined,
        setActiveChildIdIfUnset: async () => undefined,
        clearActiveChildIdIfMatches: async () => undefined,
      },
      milestoneRepository: repository,
    }),
  });
  return { runtime, repository, queue, operation };
}

describe('Milestone feature runtime', () => {
  it('acquires the shared operation and database boundaries exactly once per public operation', async () => {
    const { runtime, queue, operation } = fixture();
    const created = (await runtime.record(context, values)).value;
    await runtime.getHistory();
    await runtime.getById(context, original.id);
    const updated = (await runtime.update(context, original, {
      ...values, note: 'Uppdaterad',
    })).value;
    await runtime.checkMutation(context, {
      action: 'update', attempt: updated, expected: original,
    });
    await runtime.delete(context, original);
    expect(created.id).toBe('generated-1');
    expect(queue).toHaveBeenCalledTimes(6);
    expect(operation).toHaveBeenCalledTimes(6);
  });

  it('keeps mutation status checks read-only inside one queue acquisition', async () => {
    const create = vi.fn(async () => { throw new Error('unexpected write'); });
    const updateIfMatches = vi.fn(async () => { throw new Error('unexpected write'); });
    const deleteIfMatches = vi.fn(async () => { throw new Error('unexpected write'); });
    const { runtime, queue } = fixture({ create, updateIfMatches, deleteIfMatches });
    expect((await runtime.checkMutation(context, {
      action: 'record', attempt: original,
    })).value.status).toBe('success');
    expect(queue).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
    expect(updateIfMatches).not.toHaveBeenCalled();
    expect(deleteIfMatches).not.toHaveBeenCalled();
  });

  it('rejects foreign contexts and cursors before publishing cross-child data', async () => {
    const { runtime, repository } = fixture();
    const foreignContext = { ...context, childId: 'b' };
    await expect(runtime.getById(foreignContext, original.id))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    await expect(runtime.getHistory(context, 20, {
      childId: 'b', occurredOn: original.occurredOn, id: original.id,
    })).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(repository.listHistory).not.toHaveBeenCalled();
  });

  it('rejects a context from a replaced runtime scope', async () => {
    const replacementScope = {};
    const repository: MilestoneRepository = {
      create: vi.fn(async () => undefined),
      getById: vi.fn(async () => original),
      listHistory: vi.fn(async () => ({ items: [original], nextCursor: null })),
      updateIfMatches: vi.fn(async () => true),
      deleteIfMatches: vi.fn(async () => true),
    };
    const runtime = createMilestoneRuntime({
      runOperation: async (run) => run(),
      withDatabaseQueue: async (run) => run(),
      selection: { scope: replacementScope, getVersion: () => 0, isChanging: () => false, subscribe: () => () => {} },
      idGenerator: { generate: () => 'id' },
      getCurrentCalendarDate: () => today,
      initialize: async () => ({
        childRepository: { getById: async () => child, hasChildren: async () => true, listChildren: async () => [child], save: async () => undefined },
        activeChildRepository: { getActiveChildId: async () => child.id, setActiveChildId: async () => undefined,
          setActiveChildIdIfUnset: async () => undefined, clearActiveChildIdIfMatches: async () => undefined },
        milestoneRepository: repository,
      }),
    });
    await expect(runtime.getHistory(context)).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(repository.listHistory).not.toHaveBeenCalled();
  });

  it('preserves domain validation errors and sanitizes unknown infrastructure failures', async () => {
    const validation = fixture();
    await expect(validation.runtime.record(context, {
      ...values,
      subject: { kind: 'custom', title: ' ' },
    })).rejects.toMatchObject({ code: 'invalid-custom-title' });
    const infrastructure = fixture({ listHistory: vi.fn(async () => { throw new Error('raw SQLite path'); }) });
    const error = await infrastructure.runtime.getHistory().catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'local-data-unavailable' });
    expect(String(error)).not.toContain('SQLite path');
  });
});
