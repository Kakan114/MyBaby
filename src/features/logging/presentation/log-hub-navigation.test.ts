import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({ router: { push } }));

import { openDiaperLog, openFeedingLog, openSleepLog } from './log-hub-navigation';

describe('Logga hub navigation', () => {
  beforeEach(() => push.mockClear());

  it('keeps Feeding navigation unchanged', () => {
    openFeedingLog();
    expect(push).toHaveBeenCalledWith('/feeding');
  });

  it('opens the canonical Sleep screen for idle or ongoing status', () => {
    openSleepLog();
    expect(push).toHaveBeenCalledWith('/sleep');
  });

  it('opens the Diaper screen', () => {
    openDiaperLog();
    expect(push).toHaveBeenCalledWith('/diapers');
  });
});
