import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  reminderIdFromNotificationIdentifier,
  reminderNotificationIdentifier,
  type ReminderNotificationPermissionStatus,
  type ReminderNotificationService,
  type ScheduledReminderNotification,
} from './reminder-notification-service';

export const REMINDER_NOTIFICATION_CHANNEL_ID = 'mybaby-reminders-v1';
export const REMINDER_NOTIFICATION_TITLE = 'Påminnelse från MyBaby';
export const REMINDER_NOTIFICATION_BODY = 'Du har en sparad påminnelse.';

let notificationOperationTail: Promise<void> = Promise.resolve();

function runNotificationOperation<T>(operation: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = notificationOperationTail;
  notificationOperationTail = new Promise<void>((resolve) => { release = resolve; });
  return previous.then(operation).finally(release);
}

type PermissionLike = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;

export function mapReminderNotificationPermission(
  permission: PermissionLike,
  platform: string = Platform.OS,
): ReminderNotificationPermissionStatus {
  if (platform === 'ios' && permission.ios !== undefined) {
    switch (permission.ios.status) {
      case Notifications.IosAuthorizationStatus.AUTHORIZED:
        return 'authorized';
      case Notifications.IosAuthorizationStatus.PROVISIONAL:
        return 'provisional';
      case Notifications.IosAuthorizationStatus.EPHEMERAL:
        return 'ephemeral';
      case Notifications.IosAuthorizationStatus.DENIED:
        return 'denied';
      case Notifications.IosAuthorizationStatus.NOT_DETERMINED:
        return 'undetermined';
    }
  }
  if (permission.status === 'granted') return 'authorized';
  if (permission.status === 'denied') return 'denied';
  return 'undetermined';
}

function inspectedEpochMs(trigger: Notifications.NotificationTrigger): number | null {
  if (trigger === null || typeof trigger !== 'object' ||
    !('type' in trigger) || trigger.type !== 'date') return null;
  const values = trigger as unknown as Record<string, unknown>;
  const candidate = values.date ?? values.value ?? values.timestamp;
  const epochMs = candidate instanceof Date ? candidate.getTime() : candidate;
  return typeof epochMs === 'number' && Number.isSafeInteger(epochMs) &&
    !Number.isNaN(new Date(epochMs).getTime())
    ? epochMs
    : null;
}

export function mapScheduledReminderNotification(
  request: Notifications.NotificationRequest,
): ScheduledReminderNotification | null {
  const reminderId = reminderIdFromNotificationIdentifier(request.identifier);
  if (reminderId === null) return null;
  return {
    identifier: request.identifier,
    reminderId,
    scheduledAtEpochMs: inspectedEpochMs(request.trigger),
  };
}

export class ExpoReminderNotificationService implements ReminderNotificationService {
  async configurePlatform(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await runNotificationOperation(async () => {
      await Notifications.setNotificationChannelAsync(REMINDER_NOTIFICATION_CHANNEL_ID, {
        name: 'Påminnelser',
        description: 'Påminnelser som du har sparat i MyBaby.',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    });
  }

  async getPermissionStatus(): Promise<ReminderNotificationPermissionStatus> {
    return runNotificationOperation(async () =>
      mapReminderNotificationPermission(await Notifications.getPermissionsAsync()));
  }

  async requestPermission(): Promise<ReminderNotificationPermissionStatus> {
    await this.configurePlatform();
    const permission = await runNotificationOperation(() =>
      Notifications.requestPermissionsAsync({
        android: {},
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      }));
    return mapReminderNotificationPermission(permission);
  }

  async listScheduled(): Promise<readonly ScheduledReminderNotification[]> {
    const requests = await runNotificationOperation(
      () => Notifications.getAllScheduledNotificationsAsync(),
    );
    return requests
      .map(mapScheduledReminderNotification)
      .filter((item): item is ScheduledReminderNotification => item !== null);
  }

  async schedule(reminderId: string, scheduledAtEpochMs: number): Promise<void> {
    if (!Number.isSafeInteger(scheduledAtEpochMs) ||
      Number.isNaN(new Date(scheduledAtEpochMs).getTime())) {
      throw new Error('Invalid Reminder notification instant.');
    }
    const identifier = reminderNotificationIdentifier(reminderId);
    await runNotificationOperation(async () => {
      const returnedIdentifier = await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: REMINDER_NOTIFICATION_TITLE,
          body: REMINDER_NOTIFICATION_BODY,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: scheduledAtEpochMs,
          ...(Platform.OS === 'android' ? { channelId: REMINDER_NOTIFICATION_CHANNEL_ID } : {}),
        },
      });
      if (returnedIdentifier !== identifier) {
        try { await Notifications.cancelScheduledNotificationAsync(returnedIdentifier); }
        catch { /* best-effort cleanup of an unexpected native identifier */ }
        throw new Error('The notification scheduler returned an unexpected identifier.');
      }
    });
  }

  async cancel(reminderId: string): Promise<void> {
    await runNotificationOperation(() => Notifications.cancelScheduledNotificationAsync(
      reminderNotificationIdentifier(reminderId),
    ));
  }
}

let foregroundHandlerRegistered = false;

export function registerReminderNotificationForegroundHandler(): void {
  if (foregroundHandlerRegistered) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  foregroundHandlerRegistered = true;
}
