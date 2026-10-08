import { describe, expect, it, vi } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import type { ActiveChildDependencies } from '../../children/application/active-child';
import type { GrowthRepository } from '../application/growth-repository';
import { createGrowthMeasurement, type GrowthMeasurement } from '../domain/growth-measurement';
import type { ActiveChildContext, ActiveChildSelection } from '../../../runtime/active-child-selection';
import { createGrowthRuntime } from './create-growth-runtime';

const date = createCalendarDate('2026-10-08');
const child = { id: 'a', displayName: 'Child', dateOfBirth: createCalendarDate('2026-01-01') };
const values = { measuredOn: date, weightGrams: 4567, lengthMm: null, headCircumferenceMm: null, lengthMethod: null };
const original = createGrowthMeasurement({ ...values, id: 'id', childId: 'a', revision: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function fixture() {
  let version = 0;
  let switching = false;
  let active: string | null = 'a';
  let row: GrowthMeasurement | null = original;
  const selection: ActiveChildSelection = {
    scope: Object.freeze({}), getVersion: () => version, isChanging: () => switching,
    subscribe: () => () => {},
  };
  const context: ActiveChildContext = { childId: 'a', selectionVersion: 0, selectionScope: selection.scope };
  const repository: GrowthRepository = {
    create: vi.fn(async value => { row = value; }),
    getById: vi.fn(async () => row),
    listHistory: vi.fn(async () => ({ items: row ? [row] : [], nextCursor: null })),
    updateIfMatches: vi.fn(async (_expected, value) => { row = value; return true; }),
    deleteIfMatches: vi.fn(async () => { row = null; return true; }),
  };
  const children: ActiveChildDependencies = {
    activeChildRepository: {
      getActiveChildId: vi.fn(async () => active), setActiveChildId: async () => {},
      setActiveChildIdIfUnset: async () => {}, clearActiveChildIdIfMatches: async () => {},
    },
    childRepository: {
      getById: vi.fn(async id => id === 'a' ? child : { ...child, id }),
      hasChildren: async () => true, listChildren: async () => [child], save: async () => {},
    },
  };
  let tail: Promise<void> = Promise.resolve();
  const runOperation = vi.fn();
  async function owningOperation<T>(operation: () => Promise<T>): Promise<T> { runOperation(); return operation(); }
  const queue = vi.fn();
  function withQueue<T>(operation: () => Promise<T>): Promise<T> {
    queue();
    const next = tail.then(operation);
    tail = next.then(() => {}, () => {});
    return next;
  }
  const initialize = vi.fn(async () => ({ ...children, growthRepository: repository }));
  const clock = vi.fn(() => date);
  const runtime = createGrowthRuntime({
    selection, initialize, runOperation: owningOperation, withDatabaseQueue: withQueue,
    getCurrentCalendarDate: clock, idGenerator: { generate: () => 'new-id' },
  });
  return { runtime, repository, children, context, selection, queue, runOperation, initialize, clock,
    switchChild(id = 'b') { ++version; switching = true; active = id; },
    finishSwitch() { switching = false; },
    clearChild() { active = null; },
  };
}

describe('feature-owned Growth runtime', () => {
  it.each(['read', 'record', 'update', 'delete'] as const)('requires a resolved child context at runtime for %s', async action => {
    const f = fixture();
    const missing = undefined as unknown as ActiveChildContext;
    const operation = action === 'read' ? f.runtime.getById(missing, 'id') :
      action === 'record' ? f.runtime.record(missing, values) :
      action === 'update' ? f.runtime.update(missing, original, values) :
      f.runtime.delete(missing, original);
    await expect(operation).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.create).not.toHaveBeenCalled();
    expect(f.repository.updateIfMatches).not.toHaveBeenCalled();
    expect(f.repository.deleteIfMatches).not.toHaveBeenCalled();
  });
  it.each(['history', 'read', 'record', 'update', 'delete'] as const)('acquires the owning operation and queue once for %s', async action => {
    const f = fixture();
    const operation = action === 'history' ? f.runtime.getHistory() :
      action === 'read' ? f.runtime.getById(f.context, 'id') :
      action === 'record' ? f.runtime.record(f.context, values) :
      action === 'update' ? f.runtime.update(f.context, original, { ...values, weightGrams: 5678 }) :
      f.runtime.delete(f.context, original);
    const result = await operation;
    expect(result.context).toEqual(f.context);
    expect(result.child).toEqual(child);
    expect(f.runOperation).toHaveBeenCalledTimes(1);
    expect(f.queue).toHaveBeenCalledTimes(1);
    expect(f.children.activeChildRepository.getActiveChildId).toHaveBeenCalledTimes(1);
    expect(f.clock).toHaveBeenCalledTimes(action === 'record' || action === 'update' ? 1 : 0);
  });
  it('uses the injected calendar date, not a duration or alternate clock', async () => {
    const f = fixture();
    f.clock.mockReturnValue(createCalendarDate('2026-10-07'));
    await expect(f.runtime.record(f.context, values)).rejects.toMatchObject({ code: 'future-measurement' });
    expect(f.repository.create).not.toHaveBeenCalled();
  });
  it.each(['history', 'read', 'record', 'update', 'delete'] as const)('rejects a stale form before %s', async action => {
    const f = fixture();
    f.switchChild();
    f.finishSwitch();
    const operation = action === 'history' ? f.runtime.getHistory(f.context) :
      action === 'read' ? f.runtime.getById(f.context, 'id') :
      action === 'record' ? f.runtime.record(f.context, values) :
      action === 'update' ? f.runtime.update(f.context, original, values) :
      f.runtime.delete(f.context, original);
    await expect(operation).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.create).not.toHaveBeenCalled();
    expect(f.repository.updateIfMatches).not.toHaveBeenCalled();
    expect(f.repository.deleteIfMatches).not.toHaveBeenCalled();
  });
  it('rejects a context owned by a different runtime generation', async () => {
    const f = fixture();
    const previous = fixture();
    await expect(f.runtime.record(previous.context, values)).rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.create).not.toHaveBeenCalled();
  });
  it('rejects stale A forms after selection returns from B to A', async () => {
    const f = fixture();
    f.switchChild(); f.finishSwitch();
    f.switchChild('a'); f.finishSwitch();
    await expect(f.runtime.record(f.context, values)).rejects.toMatchObject({ code: 'stale-child-context' });
  });
  it('reports missing child without treating it as onboarding', async () => {
    const f = fixture();
    f.clearChild();
    await expect(f.runtime.getHistory()).rejects.toMatchObject({ code: 'active-child-required' });
  });
  it('rejects mismatched identity even if the selection version matches', async () => {
    const f = fixture();
    await expect(f.runtime.record({ ...f.context, childId: 'b' }, values))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    await expect(f.runtime.update(f.context, { ...original, childId: 'b' }, values))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    await expect(f.runtime.delete(f.context, { ...original, childId: 'b' }))
      .rejects.toMatchObject({ code: 'stale-child-context' });
  });
  it('rejects another child cursor and requires context for continuation', async () => {
    const f = fixture();
    const before = { childId: 'b', measuredOn: date, id: 'id' };
    await expect(f.runtime.getHistory(f.context, 20, before)).rejects.toMatchObject({ code: 'stale-child-context' });
    await expect(f.runtime.getHistory(undefined, 20, { ...before, childId: 'a' }))
      .rejects.toMatchObject({ code: 'stale-child-context' });
    expect(f.repository.listHistory).not.toHaveBeenCalled();
  });
  it('rejects a history completion when a switch starts during the read', async () => {
    const f = fixture();
    const pending = deferred<void>(); const started = deferred<void>();
    vi.mocked(f.repository.listHistory).mockImplementation(async () => {
      started.resolve(); await pending.promise;
      return { items: [original], nextCursor: null };
    });
    const operation = f.runtime.getHistory();
    const checked = expect(operation).rejects.toMatchObject({ code: 'stale-child-context' });
    await started.promise;
    f.switchChild();
    pending.resolve();
    await checked;
  });
  it('rejects an operation whose context changes while it waits for the queue', async () => {
    const f = fixture();
    const pending = deferred<void>(); const started = deferred<void>();
    vi.mocked(f.repository.listHistory).mockImplementation(async () => {
      started.resolve(); await pending.promise; return { items: [], nextCursor: null };
    });
    const first = f.runtime.getHistory();
    const firstCheck = expect(first).rejects.toMatchObject({ code: 'stale-child-context' });
    await started.promise;
    const second = f.runtime.record(f.context, values);
    const secondCheck = expect(second).rejects.toMatchObject({ code: 'stale-child-context' });
    f.switchChild(); pending.resolve();
    await firstCheck; await secondCheck;
    expect(f.repository.create).not.toHaveBeenCalled();
  });
  it.each(['update', 'delete'] as const)('rejects switching during %s preflight before the write', async action => {
    const f = fixture();
    const pending = deferred<void>(); const started = deferred<void>();
    vi.mocked(f.repository.getById).mockImplementation(async () => { started.resolve(); await pending.promise; return original; });
    const operation = action === 'update' ? f.runtime.update(f.context, original, values) : f.runtime.delete(f.context, original);
    const checked = expect(operation).rejects.toMatchObject({ code: 'stale-child-context' });
    await started.promise;
    f.switchChild(); pending.resolve(); await checked;
    expect(f.repository.updateIfMatches).not.toHaveBeenCalled();
    expect(f.repository.deleteIfMatches).not.toHaveBeenCalled();
  });
  it.each(['record', 'update', 'delete'] as const)('retains known %s success when switching during a write', async action => {
    const f = fixture();
    const pending = deferred<void>(); const started = deferred<void>();
    const method = action === 'record' ? f.repository.create : action === 'update' ? f.repository.updateIfMatches : f.repository.deleteIfMatches;
    const wait = async () => { started.resolve(); await pending.promise; };
    if (action === 'record') vi.mocked(f.repository.create).mockImplementation(wait);
    else if (action === 'update') vi.mocked(f.repository.updateIfMatches).mockImplementation(async () => { await wait(); return true; });
    else vi.mocked(f.repository.deleteIfMatches).mockImplementation(async () => { await wait(); return true; });
    const operation = action === 'record' ? f.runtime.record(f.context, values) :
      action === 'update' ? f.runtime.update(f.context, original, values) : f.runtime.delete(f.context, original);
    const checked = expect(operation).rejects.toMatchObject({
      code: 'stale-child-context', completedMutation: { action, measurement: { childId: 'a' } },
    });
    await started.promise;
    f.switchChild(); pending.resolve(); await checked;
    expect(method).toHaveBeenCalledTimes(1);
  });
  it('retains the exact uncertain create after switching during reconciliation', async () => {
    const f = fixture();
    const pending = deferred<void>(); const started = deferred<void>();
    vi.mocked(f.repository.create).mockRejectedValue(new Error('private database path'));
    vi.mocked(f.repository.getById).mockImplementation(async () => {
      started.resolve(); await pending.promise; throw new Error('private key');
    });
    const operation = f.runtime.record(f.context, values);
    const checked = expect(operation).rejects.toMatchObject({
      code: 'mutation-outcome-uncertain', pendingMeasurement: { id: 'new-id', childId: 'a', revision: 1 },
    });
    await started.promise;
    f.switchChild(); pending.resolve(); await checked;
    expect(f.queue).toHaveBeenCalledTimes(1);
    expect(f.repository.create).toHaveBeenCalledTimes(1);
  });
  it('sanitizes initialization and invalid-clock failures', async () => {
    const f = fixture();
    f.initialize.mockRejectedValueOnce(new Error('SQLCipher path/key'));
    await expect(f.runtime.getHistory()).rejects.toMatchObject({ code: 'local-data-unavailable', message: 'The growth operation is not available.' });
    f.clock.mockImplementation(() => { throw new Error('private clock'); });
    await expect(f.runtime.record(f.context, values)).rejects.toMatchObject({ code: 'local-data-unavailable' });
  });
});
