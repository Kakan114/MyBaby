import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  dismissTimerSaved: vi.fn(),
  focusEffect: undefined as undefined | (() => () => void),
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => { harness.focusEffect = effect; },
}));
vi.mock('./breastfeeding-timer-provider', () => ({
  useBreastfeedingTimer: () => ({ dismissSaved: harness.dismissTimerSaved }),
}));

import { FeedingSuccessFocusLifecycle } from './feeding-success-focus-lifecycle';

describe('feeding confirmed-success focus lifecycle', () => {
  beforeEach(() => {
    harness.dismissTimerSaved.mockClear();
    harness.focusEffect = undefined;
  });

  it('clears confirmed acknowledgements only when Logga loses focus', () => {
    const dismissSubmissionSuccess = vi.fn();
    FeedingSuccessFocusLifecycle({ dismissSubmissionSuccess });
    const cleanup = harness.focusEffect!();

    expect(dismissSubmissionSuccess).not.toHaveBeenCalled();
    expect(harness.dismissTimerSaved).not.toHaveBeenCalled();

    cleanup();

    expect(dismissSubmissionSuccess).toHaveBeenCalledOnce();
    expect(harness.dismissTimerSaved).toHaveBeenCalledOnce();
  });

  it('does not clear success merely because the component renders again', () => {
    const dismissSubmissionSuccess = vi.fn();
    FeedingSuccessFocusLifecycle({ dismissSubmissionSuccess });
    FeedingSuccessFocusLifecycle({ dismissSubmissionSuccess });

    expect(dismissSubmissionSuccess).not.toHaveBeenCalled();
    expect(harness.dismissTimerSaved).not.toHaveBeenCalled();
  });
});
