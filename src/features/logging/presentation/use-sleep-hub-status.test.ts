import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SleepRuntimeState } from '@/runtime/app-runtime';

const harness = vi.hoisted(() => ({
  getState: vi.fn(),
  focusEffect: undefined as undefined | (() => () => void),
  appStateListener: undefined as undefined | ((state: string) => void),
  remove: vi.fn(),
  currentState: 'active',
  states: [] as unknown[],
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => [initial, (next: unknown) => harness.states.push(next)],
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => { harness.focusEffect = effect; },
}));
vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return harness.currentState; },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      harness.appStateListener = listener;
      return { remove: harness.remove };
    },
  },
}));
vi.mock('@/runtime/app-runtime-provider', () => ({
  useSleepRuntime: () => ({ getState: harness.getState }),
}));

import { useSleepHubStatus } from './use-sleep-hub-status';

const active: SleepRuntimeState = {
  childId: 'child-a',
  active: { id: 'sleep-a', childId: 'child-a', startedAtEpochMs: 1_000 },
  events: [], nowEpochMs: 2_000, clockMovedBackward: false,
};

describe('Sleep hub focus lifecycle', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    harness.getState.mockReset().mockResolvedValue(active);
    harness.remove.mockClear();
    harness.states.length = 0;
    harness.currentState = 'active';
    useSleepHubStatus();
    cleanup = harness.focusEffect!();
  });

  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
  });

  it('refreshes on focus and app resume without polling persistence each second', async () => {
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.getState).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(harness.getState).toHaveBeenCalledOnce();
    harness.appStateListener?.('active');
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.getState).toHaveBeenCalledTimes(2);
  });

  it('removes lifecycle work on blur', () => {
    cleanup?.();
    cleanup = undefined;
    expect(harness.remove).toHaveBeenCalledOnce();
    expect(harness.states.at(-1)).toEqual({ status: 'loading' });
  });
});
