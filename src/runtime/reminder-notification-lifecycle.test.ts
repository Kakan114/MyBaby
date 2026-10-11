import { describe, expect, it, vi } from 'vitest';

import type { ReminderNotificationsRuntime } from './app-runtime';
import { startReminderNotificationLifecycle } from './reminder-notification-lifecycle';

function fixture() {
  let listener: ((state: string) => void) | null = null;
  const remove = vi.fn();
  const reconcile = vi.fn(async () => ({
    status: 'synchronized' as const,
    permission: 'authorized' as const,
    desiredCount: 0,
    scheduledCount: 0,
  }));
  const runtime = {
    reconcile,
    getPermissionStatus: vi.fn(),
    requestPermission: vi.fn(),
  } as unknown as ReminderNotificationsRuntime;
  const appState = {
    currentState: 'active',
    addEventListener: vi.fn((_event: 'change', next: (state: string) => void) => {
      listener = next;
      return { remove };
    }),
  };
  return { appState, reconcile, remove, runtime, send: (state: string) => listener?.(state) };
}

describe('Reminder notification runtime lifecycle', () => {
  it('reconciles at startup and exactly once for each return to foreground', async () => {
    const test = fixture();
    const stop = startReminderNotificationLifecycle(test.runtime, test.appState);
    expect(test.reconcile).toHaveBeenCalledOnce();
    test.send('active');
    expect(test.reconcile).toHaveBeenCalledOnce();
    test.send('background');
    test.send('inactive');
    test.send('active');
    expect(test.reconcile).toHaveBeenCalledTimes(2);
    stop();
    expect(test.remove).toHaveBeenCalledOnce();
    test.send('background');
    test.send('active');
    expect(test.reconcile).toHaveBeenCalledTimes(2);
  });

  it('contains reconciliation failures and removes the one registered listener', async () => {
    const test = fixture();
    test.reconcile.mockRejectedValue(new Error('native failure'));
    const stop = startReminderNotificationLifecycle(test.runtime, test.appState);
    await Promise.resolve();
    test.send('background');
    test.send('active');
    await Promise.resolve();
    stop();
    expect(test.appState.addEventListener).toHaveBeenCalledOnce();
    expect(test.remove).toHaveBeenCalledOnce();
  });
});
