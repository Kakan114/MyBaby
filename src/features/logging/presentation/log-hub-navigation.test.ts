import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({ router: { push } }));

import { openDiaperLog, openFeedingLog, openSleepLog, openGrowthLog, openMilestones } from './log-hub-navigation';

describe('Logga hub navigation', () => {
  it('opens Growth logging', () => { openGrowthLog(); expect(push).toHaveBeenCalledWith('/growth'); });
  it('opens Milestones recording', () => { openMilestones(); expect(push).toHaveBeenCalledWith('/milestones'); });
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
