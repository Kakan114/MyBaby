import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCalendarDate } from '../domain/calendar-date';
import type { Child } from '../domain/child';

const harness = vi.hoisted(() => ({
  currentState: undefined as unknown,
  effect: undefined as undefined | (() => () => void),
  listChildren: vi.fn(),
  refreshBootstrap: vi.fn(),
  setActiveChild: vi.fn(),
  states: [] as unknown[],
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => () => void) => {
    harness.effect = effect;
  },
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => {
    harness.currentState = value;
    return [
      value,
      (next: unknown) => {
        harness.currentState =
          typeof next === 'function'
            ? (next as (current: unknown) => unknown)(harness.currentState)
            : next;
        harness.states.push(harness.currentState);
      },
    ];
  },
}));

vi.mock('@/runtime/app-runtime-provider', () => ({
  useChildrenRuntime: () => ({
    listChildren: harness.listChildren,
    setActiveChild: harness.setActiveChild,
  }),
}));

import { useActiveChildSelectionRecovery } from './use-active-child-selection-recovery';

const child: Child = {
  id: 'child-1',
  displayName: 'Mio',
  dateOfBirth: createCalendarDate('2025-01-10'),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

let cleanup: (() => void) | undefined;

function mount() {
  const hook = useActiveChildSelectionRecovery(harness.refreshBootstrap);
  cleanup = harness.effect!();
  return hook;
}

beforeEach(() => {
  harness.currentState = undefined;
  harness.effect = undefined;
  harness.states.length = 0;
  harness.listChildren.mockReset().mockResolvedValue([child]);
  harness.setActiveChild.mockReset().mockResolvedValue(child);
  harness.refreshBootstrap.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('active-child selection recovery presentation state', () => {
  it('starts loading and exposes the saved children', async () => {
    mount();

    expect(harness.states[0]).toEqual({ status: 'loading' });
    await flushPromises();
    expect(harness.currentState).toEqual({ status: 'ready', children: [child] });
  });

  it('represents an inconsistent empty list separately', async () => {
    harness.listChildren.mockResolvedValue([]);
    mount();

    await flushPromises();
    expect(harness.currentState).toEqual({ status: 'empty' });
  });

  it('represents list failure without exposing its details and can retry the read', async () => {
    harness.listChildren
      .mockRejectedValueOnce(new Error('secret SQLite path'))
      .mockResolvedValueOnce([child]);
    const hook = mount();

    await flushPromises();
    expect(harness.currentState).toEqual({ status: 'error' });
    await hook.loadChildren();
    expect(harness.currentState).toEqual({ status: 'ready', children: [child] });
  });

  it('persists one selection and refreshes bootstrap after success', async () => {
    const hook = mount();
    await flushPromises();

    await hook.selectChild(child.id);

    expect(harness.setActiveChild).toHaveBeenCalledWith(child.id);
    expect(harness.refreshBootstrap).toHaveBeenCalledOnce();
  });

  it('locks duplicate selection submissions synchronously', async () => {
    const selection = deferred<Child>();
    harness.setActiveChild.mockReturnValue(selection.promise);
    const hook = mount();
    await flushPromises();

    const first = hook.selectChild(child.id);
    const duplicate = hook.selectChild(child.id);

    expect(harness.setActiveChild).toHaveBeenCalledOnce();
    await duplicate;
    selection.resolve(child);
    await first;
    expect(harness.refreshBootstrap).toHaveBeenCalledOnce();
  });

  it('treats selection failure as uncertain and only rechecks bootstrap', async () => {
    harness.setActiveChild.mockRejectedValueOnce(
      new Error('unknown persistence outcome'),
    );
    const hook = mount();
    await flushPromises();

    await hook.selectChild(child.id);
    expect(harness.currentState).toEqual({ status: 'uncertain' });
    expect(harness.refreshBootstrap).not.toHaveBeenCalled();

    harness.refreshBootstrap.mockRejectedValueOnce(
      new Error('bootstrap still unavailable'),
    );
    await expect(hook.recheckBootstrap()).resolves.toBeUndefined();
    expect(harness.refreshBootstrap).toHaveBeenCalledOnce();
    expect(harness.setActiveChild).toHaveBeenCalledOnce();
    expect(harness.currentState).toEqual({ status: 'uncertain' });
  });

  it('ignores a stale child-list result after a newer load', async () => {
    const earlier = deferred<readonly Child[]>();
    const newerChild = { ...child, id: 'child-2', displayName: 'Mira' };
    harness.listChildren
      .mockReturnValueOnce(earlier.promise)
      .mockResolvedValueOnce([newerChild]);
    const hook = mount();

    await hook.loadChildren();
    expect(harness.currentState).toEqual({
      status: 'ready',
      children: [newerChild],
    });
    const stateCount = harness.states.length;
    earlier.resolve([child]);
    await flushPromises();
    expect(harness.states).toHaveLength(stateCount);
  });

  it('does not update after unmount while a list request is pending', async () => {
    const pending = deferred<readonly Child[]>();
    harness.listChildren.mockReturnValueOnce(pending.promise);
    mount();
    cleanup!();
    cleanup = undefined;
    const stateCount = harness.states.length;

    pending.resolve([child]);
    await flushPromises();
    expect(harness.states).toHaveLength(stateCount);
  });

  it('does not update or refresh bootstrap after unmount during selection', async () => {
    const pending = deferred<Child>();
    harness.setActiveChild.mockReturnValueOnce(pending.promise);
    const hook = mount();
    await flushPromises();
    const selection = hook.selectChild(child.id);
    cleanup!();
    cleanup = undefined;
    const stateCount = harness.states.length;

    pending.resolve(child);
    await selection;
    expect(harness.states).toHaveLength(stateCount);
    expect(harness.refreshBootstrap).not.toHaveBeenCalled();
  });
});
