import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  cancel: vi.fn(async () => undefined),
  getAll: vi.fn(async () => [] as unknown[]),
  getPermissions: vi.fn(async () => ({ status: 'undetermined' })),
  requestPermissions: vi.fn(async () => ({ status: 'undetermined' })),
  schedule: vi.fn(async (request: {
    identifier?: string;
    content?: Record<string, unknown>;
  }) => request.identifier ?? 'generated'),
  setChannel: vi.fn(async () => null),
  setHandler: vi.fn(),
}));

vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4,
  },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  cancelScheduledNotificationAsync: mocks.cancel,
  getAllScheduledNotificationsAsync: mocks.getAll,
  getPermissionsAsync: mocks.getPermissions,
  requestPermissionsAsync: mocks.requestPermissions,
  scheduleNotificationAsync: mocks.schedule,
  setNotificationChannelAsync: mocks.setChannel,
  setNotificationHandler: mocks.setHandler,
}));

import {
  ExpoReminderNotificationService,
  mapReminderNotificationPermission,
  REMINDER_NOTIFICATION_BODY,
  REMINDER_NOTIFICATION_CHANNEL_ID,
  REMINDER_NOTIFICATION_TITLE,
  registerReminderNotificationForegroundHandler,
} from './expo-reminder-notification-service';

describe('Expo Reminder notification adapter', () => {
  beforeEach(() => {
    mocks.platform.OS = 'ios';
    vi.clearAllMocks();
    mocks.schedule.mockImplementation(async (request) => request.identifier ?? 'generated');
  });

  it('maps granular iOS and root platform permission states', () => {
    for (const [status, expected] of [
      [0, 'undetermined'], [1, 'denied'], [2, 'authorized'],
      [3, 'provisional'], [4, 'ephemeral'],
    ] as const) {
      expect(mapReminderNotificationPermission({
        status: 'denied', granted: false, canAskAgain: false, expires: 'never',
        ios: { status } as never,
      } as never, 'ios')).toBe(expected);
    }
    expect(mapReminderNotificationPermission({
      status: 'granted', granted: true, canAskAgain: false, expires: 'never',
    } as never, 'android')).toBe('authorized');
  });

  it('configures the Android channel before requesting permission', async () => {
    mocks.platform.OS = 'android';
    const order: string[] = [];
    mocks.setChannel.mockImplementationOnce(async () => { order.push('channel'); return null; });
    mocks.requestPermissions.mockImplementationOnce(async () => {
      order.push('permission');
      return { status: 'granted', granted: true, canAskAgain: false, expires: 'never' };
    });
    await expect(new ExpoReminderNotificationService().requestPermission())
      .resolves.toBe('authorized');
    expect(order).toEqual(['channel', 'permission']);
    expect(mocks.setChannel).toHaveBeenCalledWith(REMINDER_NOTIFICATION_CHANNEL_ID, {
      name: 'Påminnelser',
      description: 'Påminnelser som du har sparat i MyBaby.',
      importance: 5,
      sound: 'default',
    });
  });

  it('uses caller-supplied IDs, generic copy, no data payload and an absolute trigger', async () => {
    const service = new ExpoReminderNotificationService();
    await service.schedule('reminder-1', 1_800_000_000_000);
    expect(mocks.schedule).toHaveBeenCalledWith({
      identifier: 'mybaby.reminder.v1.reminder-1',
      content: {
        title: REMINDER_NOTIFICATION_TITLE,
        body: REMINDER_NOTIFICATION_BODY,
        sound: 'default',
      },
      trigger: { type: 'date', date: 1_800_000_000_000 },
    });
    expect(mocks.schedule.mock.calls[0]?.[0].content).not.toHaveProperty('data');
  });

  it('inspects only owned notifications and accepts Android absolute timestamps', async () => {
    mocks.getAll.mockResolvedValueOnce([
      { identifier: 'unrelated', content: {}, trigger: { type: 'date', value: 1 } },
      {
        identifier: 'mybaby.reminder.v1.a', content: {},
        trigger: { type: 'date', value: 1_800_000_000_000 },
      },
      {
        identifier: 'mybaby.reminder.v1.b', content: {},
        trigger: { type: 'timeInterval', seconds: 60 },
      },
    ]);
    await expect(new ExpoReminderNotificationService().listScheduled()).resolves.toEqual([
      {
        identifier: 'mybaby.reminder.v1.a', reminderId: 'a',
        scheduledAtEpochMs: 1_800_000_000_000,
      },
      {
        identifier: 'mybaby.reminder.v1.b', reminderId: 'b', scheduledAtEpochMs: null,
      },
    ]);
  });

  it('propagates schedule/cancel failures and cleans an unexpected returned ID', async () => {
    const service = new ExpoReminderNotificationService();
    const failure = new Error('native schedule failed');
    mocks.schedule.mockRejectedValueOnce(failure);
    await expect(service.schedule('a', 1_800_000_000_000)).rejects.toBe(failure);
    mocks.schedule.mockResolvedValueOnce('unexpected');
    await expect(service.schedule('a', 1_800_000_000_000)).rejects.toThrow();
    expect(mocks.cancel).toHaveBeenCalledWith('unexpected');
    mocks.cancel.mockRejectedValueOnce(failure);
    await expect(service.cancel('a')).rejects.toBe(failure);
  });

  it('registers one privacy-consistent foreground handler', async () => {
    registerReminderNotificationForegroundHandler();
    registerReminderNotificationForegroundHandler();
    expect(mocks.setHandler).toHaveBeenCalledTimes(1);
    const handler = mocks.setHandler.mock.calls[0]?.[0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('serializes native operations across adapter instances for runtime replacement safety', async () => {
    let resolveSchedule!: (identifier: string) => void;
    mocks.schedule.mockImplementationOnce(() => new Promise<string>((resolve) => {
      resolveSchedule = resolve;
    }));
    const oldRuntimeService = new ExpoReminderNotificationService();
    const newRuntimeService = new ExpoReminderNotificationService();
    const scheduling = oldRuntimeService.schedule('old', 1_800_000_000_000);
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledOnce());
    const cancellation = newRuntimeService.cancel('new');
    await Promise.resolve();
    expect(mocks.cancel).not.toHaveBeenCalled();
    resolveSchedule('mybaby.reminder.v1.old');
    await scheduling;
    await cancellation;
    expect(mocks.cancel).toHaveBeenCalledWith('mybaby.reminder.v1.new');
    expect(mocks.schedule.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.cancel.mock.invocationCallOrder[0]!);
  });
});
