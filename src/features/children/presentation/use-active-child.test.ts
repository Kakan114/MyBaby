import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveChildSummary } from '../application/get-active-child-summary';
import { createCalendarDate } from '../domain/calendar-date';

const harness = vi.hoisted(() => ({
  read: vi.fn(),
  states: [] as unknown[],
  currentState: undefined as unknown,
  focusEffect: undefined as undefined | (() => () => void),
  listener: undefined as undefined | ((state: string) => void),
  remove: vi.fn(),
  appState: { currentState: 'active' },
}));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => {
    harness.currentState = value;
    return [value, (next: unknown) => {
      harness.currentState = typeof next === 'function'
        ? next(harness.currentState)
        : next;
      harness.states.push(harness.currentState);
    }];
  },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => { harness.focusEffect = effect; },
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return harness.appState.currentState; },
    addEventListener: (_: string, listener: (state: string) => void) => {
      harness.listener = listener;
      return { remove: harness.remove };
    },
  },
}));
vi.mock('@/runtime/app-runtime-provider', () => ({
  useChildrenRuntime: () => ({ getActiveChildSummary: harness.read }),
}));

import { useActiveChild } from './use-active-child';

const summary: ActiveChildSummary = {
  child: { id: 'child-1', displayName: 'Mio', dateOfBirth: createCalendarDate('2025-01-01') },
  age: { years: 0, months: 1, days: 0, fullDays: 31, fullWeeks: 4, remainingWeekDays: 3 },
};

function deferred() {
  let resolve!: (value: ActiveChildSummary | null) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ActiveChildSummary | null>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let cleanup: (() => void) | undefined;
function mount() {
  const hook = useActiveChild();
  cleanup = harness.focusEffect!();
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.read.mockReset().mockResolvedValue(summary);
  harness.states.length = 0;
  harness.remove.mockClear();
  harness.appState.currentState = 'active';
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

describe('active child presentation lifecycle', () => {
  it('loads the runtime summary and represents missing separately', async () => {
    const hook = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.states.at(-1)).toEqual({ status: 'ready', summary });
    harness.read.mockResolvedValueOnce(null);
    await hook.retry();
    expect(harness.states.at(-1)).toEqual({ status: 'missing' });
  });

  it('does not expose technical failures and can retry', async () => {
    harness.read.mockRejectedValueOnce(new Error('secret SQLite/path/key'));
    const hook = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.states.at(-1)).toEqual({ status: 'error' });
    await hook.retry();
    expect(harness.states.at(-1)).toEqual({ status: 'ready', summary });
  });

  it('ignores an older response after a newer retry', async () => {
    const first = deferred();
    harness.read.mockReturnValueOnce(first.promise);
    const hook = mount();
    await hook.retry();
    const count = harness.states.length;
    first.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.states).toHaveLength(count);
    expect(harness.states.at(-1)).toEqual({ status: 'ready', summary });
  });

  it('ignores pending failure after unmount and removes subscriptions', async () => {
    const pending = deferred();
    harness.read.mockReturnValueOnce(pending.promise);
    mount();
    cleanup!();
    cleanup = undefined;
    const count = harness.states.length;
    pending.reject(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.states).toHaveLength(count);
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.read).toHaveBeenCalledOnce();
  });

  it('invalidates pre-background reads and reloads on resume', async () => {
    const pending = deferred();
    harness.read.mockReturnValueOnce(pending.promise);
    mount();
    harness.appState.currentState = 'background';
    harness.listener!('background');
    pending.resolve(null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.states.at(-1)).toEqual({ status: 'loading' });
    expect(harness.read).toHaveBeenCalledOnce();
    harness.appState.currentState = 'active';
    harness.listener!('active');
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.states.at(-1)).toEqual({ status: 'ready', summary });
  });

  it('refreshes while focused without flashing loading and stops on blur', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    harness.states.length = 0;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.read).toHaveBeenCalledTimes(2);
    expect(harness.states).toEqual([{ status: 'ready', summary }]);
    cleanup!();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.read).toHaveBeenCalledTimes(2);
  });

  it('does not let a previous focus read overwrite the next focus', async () => {
    const pending = deferred();
    harness.read.mockReturnValueOnce(pending.promise);
    mount();
    cleanup!();
    cleanup = harness.focusEffect!();
    await vi.advanceTimersByTimeAsync(0);
    const count = harness.states.length;
    pending.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.states).toHaveLength(count);
    expect(harness.states.at(-1)).toEqual({ status: 'ready', summary });
  });
});

describe('routine refresh preserves ready content', () => {
  const latest: ActiveChildSummary = {
    child: { ...summary.child, id: 'child-2', displayName: 'Kim' },
    age: { ...summary.age, days: 1, fullDays: 32, remainingWeekDays: 4 },
  };

  function focusAgain() {
    cleanup!();
    cleanup = harness.focusEffect!();
  }

  function resume() {
    harness.listener!('background');
    harness.listener!('active');
  }

  it('uses loading for the initial unresolved load', async () => {
    const pending = deferred();
    harness.read.mockReturnValueOnce(pending.promise);
    mount();
    expect(harness.currentState).toEqual({ status: 'loading' });
    pending.resolve(summary);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.currentState).toEqual({ status: 'ready', summary });
  });

  it.each(['focus', 'resume'] as const)(
    'keeps the ready snapshot during a pending %s refresh and replaces it on success',
    async (trigger) => {
      mount();
      await vi.advanceTimersByTimeAsync(0);
      const pending = deferred();
      harness.read.mockReturnValueOnce(pending.promise);
      harness.states.length = 0;
      if (trigger === 'focus') focusAgain();
      else resume();
      expect(harness.currentState).toEqual({ status: 'ready', summary });
      expect(harness.states).not.toContainEqual({ status: 'loading' });
      pending.resolve(latest);
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.currentState).toEqual({ status: 'ready', summary: latest });
    },
  );

  it.each(['missing', 'error'] as const)(
    'removes the old child when refresh resolves as %s',
    async (outcome) => {
      mount();
      await vi.advanceTimersByTimeAsync(0);
      const pending = deferred();
      harness.read.mockReturnValueOnce(pending.promise);
      focusAgain();
      expect(harness.currentState).toEqual({ status: 'ready', summary });
      if (outcome === 'missing') pending.resolve(null);
      else pending.reject(new Error('private data'));
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.currentState).toEqual({ status: outcome });
    },
  );

  it('does not allow an earlier routine refresh to overwrite a newer result', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    const earlier = deferred();
    harness.read.mockReturnValueOnce(earlier.promise);
    focusAgain();
    harness.read.mockResolvedValueOnce(latest);
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.currentState).toEqual({ status: 'ready', summary: latest });
    const count = harness.states.length;
    earlier.resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.states).toHaveLength(count);
  });

  it('does not update after unmount during a routine refresh', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    const pending = deferred();
    harness.read.mockReturnValueOnce(pending.promise);
    resume();
    cleanup!();
    cleanup = undefined;
    const count = harness.states.length;
    pending.resolve(latest);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.states).toHaveLength(count);
    expect(harness.currentState).toEqual({ status: 'ready', summary });
  });

  it.each(['missing', 'error'] as const)(
    'keeps explicit retry loading after %s',
    async (outcome) => {
      if (outcome === 'missing') harness.read.mockResolvedValueOnce(null);
      else harness.read.mockRejectedValueOnce(new Error('private data'));
      const hook = mount();
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.currentState).toEqual({ status: outcome });
      const pending = deferred();
      harness.read.mockReturnValueOnce(pending.promise);
      const retry = hook.retry();
      expect(harness.currentState).toEqual({ status: 'loading' });
      pending.resolve(latest);
      await retry;
      expect(harness.currentState).toEqual({ status: 'ready', summary: latest });
    },
  );

  it('does not let periodic refresh supersede a pending focus refresh', async () => {
    mount();
    await vi.advanceTimersByTimeAsync(0);
    const pending = deferred();
    harness.read.mockReturnValueOnce(pending.promise);
    focusAgain();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.read).toHaveBeenCalledTimes(2);
    expect(harness.currentState).toEqual({ status: 'ready', summary });
    pending.resolve(latest);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.currentState).toEqual({ status: 'ready', summary: latest });
  });
});
