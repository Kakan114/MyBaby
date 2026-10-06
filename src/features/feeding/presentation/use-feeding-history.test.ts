import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  focusEffect: undefined as undefined | (() => () => void),
  read: vi.fn(),
  states: [] as unknown[],
  memo: undefined as unknown,
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => {
    harness.memo ??= factory();
    return harness.memo;
  },
  useState: (initial: unknown) => [initial, (state: unknown) => harness.states.push(state)],
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => { harness.focusEffect = effect; },
}));
vi.mock('@/runtime/app-runtime-provider', () => ({
  useFeedingRuntime: () => ({ getRecentFeedings: harness.read }),
}));

import { useFeedingHistory } from './use-feeding-history';

describe('feeding history focus lifecycle', () => {
  beforeEach(() => {
    harness.focusEffect = undefined;
    harness.states.length = 0;
    harness.memo = undefined;
    harness.read.mockReset().mockResolvedValue({ childId: 'child-1', events: [] });
  });

  it('reloads on initial focus and when the mounted route regains focus', async () => {
    useFeedingHistory();
    let cleanup = harness.focusEffect!();
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(1));
    cleanup();
    expect(harness.states.at(-1)).toEqual({ status: 'loading' });
    cleanup = harness.focusEffect!();
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(2));
    cleanup();
  });
});
