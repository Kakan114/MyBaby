import {
  canDeliverReminderNotifications,
  type ReminderNotificationPermissionStatus,
  type ReminderNotificationService,
  type ScheduledReminderNotification,
} from './reminder-notification-service';

export const REMINDER_NOTIFICATION_PROJECTION_LIMIT = 50;

export type CanonicalReminderNotification = Readonly<{
  id: string;
  scheduledAtEpochMs: number;
}>;

export type ReminderNotificationReconciliationResult = Readonly<{
  status: 'synchronized' | 'permission-unavailable' | 'degraded' | 'closed';
  permission: ReminderNotificationPermissionStatus | null;
  desiredCount: number;
  scheduledCount: number;
}>;

type Dependencies = Readonly<{
  service: ReminderNotificationService;
  loadCanonicalReminders(): Promise<readonly CanonicalReminderNotification[]>;
}>;

function compareReminders(
  left: CanonicalReminderNotification,
  right: CanonicalReminderNotification,
): number {
  return left.scheduledAtEpochMs - right.scheduledAtEpochMs || left.id.localeCompare(right.id);
}

function scheduledById(
  scheduled: readonly ScheduledReminderNotification[],
): Map<string, ScheduledReminderNotification> {
  return new Map(scheduled.map((item) => [item.reminderId, item]));
}

export function createReminderNotificationCoordinator(dependencies: Dependencies) {
  let pending: Promise<ReminderNotificationReconciliationResult> | null = null;
  let closed = false;

  async function reconcileOnce(): Promise<ReminderNotificationReconciliationResult> {
    if (closed) {
      return { status: 'closed', permission: null, desiredCount: 0, scheduledCount: 0 };
    }

    let canonical: readonly CanonicalReminderNotification[];
    try {
      canonical = [...await dependencies.loadCanonicalReminders()]
        .sort(compareReminders)
        .slice(0, REMINDER_NOTIFICATION_PROJECTION_LIMIT);
    } catch {
      // A failed canonical read must never be interpreted as an empty reminder set.
      return { status: 'degraded', permission: null, desiredCount: 0, scheduledCount: 0 };
    }
    if (closed) {
      return { status: 'closed', permission: null, desiredCount: canonical.length, scheduledCount: 0 };
    }

    let permission: ReminderNotificationPermissionStatus;
    let scheduled: readonly ScheduledReminderNotification[];
    try {
      await dependencies.service.configurePlatform();
      permission = await dependencies.service.getPermissionStatus();
      scheduled = await dependencies.service.listScheduled();
    } catch {
      return { status: 'degraded', permission: null, desiredCount: canonical.length, scheduledCount: 0 };
    }

    const canDeliver = canDeliverReminderNotifications(permission);
    const desired = canDeliver ? new Map(canonical.map((item) => [item.id, item])) : new Map();
    const before = scheduledById(scheduled);
    const cancelIds = [...before.values()]
      .filter((item) => {
        const reminder = desired.get(item.reminderId);
        return reminder === undefined || item.scheduledAtEpochMs === null ||
          item.scheduledAtEpochMs !== reminder.scheduledAtEpochMs;
      })
      .map((item) => item.reminderId);

    for (const reminderId of cancelIds) {
      if (closed) break;
      try { await dependencies.service.cancel(reminderId); }
      catch { /* canonical inspection below determines whether cancellation took effect */ }
    }
    if (closed) {
      return { status: 'closed', permission, desiredCount: canonical.length, scheduledCount: 0 };
    }

    let afterCancellation: readonly ScheduledReminderNotification[];
    try { afterCancellation = await dependencies.service.listScheduled(); }
    catch {
      return { status: 'degraded', permission, desiredCount: canonical.length, scheduledCount: 0 };
    }
    const afterCancellationById = scheduledById(afterCancellation);
    const cancellationsStillPresent = new Set(
      cancelIds.filter((reminderId) => afterCancellationById.has(reminderId)),
    );

    for (const reminder of desired.values()) {
      if (closed) break;
      if (afterCancellationById.has(reminder.id)) continue;
      try { await dependencies.service.schedule(reminder.id, reminder.scheduledAtEpochMs); }
      catch { /* a lost response is resolved by inspecting the actual OS schedule below */ }
    }
    if (closed) {
      return { status: 'closed', permission, desiredCount: canonical.length, scheduledCount: 0 };
    }

    let finalScheduled: readonly ScheduledReminderNotification[];
    try { finalScheduled = await dependencies.service.listScheduled(); }
    catch {
      return { status: 'degraded', permission, desiredCount: canonical.length, scheduledCount: 0 };
    }
    const finalById = scheduledById(finalScheduled);
    const exactProjection = cancellationsStillPresent.size === 0 &&
      finalScheduled.length === desired.size &&
      [...desired.values()].every((reminder) => {
        const actual = finalById.get(reminder.id);
        return actual !== undefined &&
          (actual.scheduledAtEpochMs === null ||
            actual.scheduledAtEpochMs === reminder.scheduledAtEpochMs);
      });

    return {
      status: exactProjection
        ? canDeliver ? 'synchronized' : 'permission-unavailable'
        : 'degraded',
      permission,
      desiredCount: canonical.length,
      scheduledCount: finalScheduled.length,
    };
  }

  return Object.freeze({
    reconcile(): Promise<ReminderNotificationReconciliationResult> {
      if (closed) return reconcileOnce();
      if (pending !== null) return pending;
      const current = reconcileOnce();
      pending = current;
      void current.finally(() => {
        if (pending === current) pending = null;
      }).catch(() => undefined);
      return current;
    },
    close(): void {
      closed = true;
    },
  });
}

export type ReminderNotificationCoordinator = ReturnType<
  typeof createReminderNotificationCoordinator
>;
