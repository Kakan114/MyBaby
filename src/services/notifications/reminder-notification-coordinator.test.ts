import { describe, expect, it, vi } from 'vitest';

import { createReminder, type Reminder } from '../../features/reminders/domain/reminder';
import {
  createReminderNotificationCoordinator,
  REMINDER_NOTIFICATION_PROJECTION_LIMIT,
} from './reminder-notification-coordinator';
import type {
  ReminderNotificationPermissionStatus,
  ReminderNotificationService,
  ScheduledReminderNotification,
} from './reminder-notification-service';

function reminder(
  id: string,
  scheduledAtEpochMs: number,
  childId = 'child-a',
): Reminder {
  return createReminder({ id, childId, title: 'Privat titel', scheduledAtEpochMs, revision: 1 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeNotificationService implements ReminderNotificationService {
  permission: ReminderNotificationPermissionStatus = 'authorized';
  readonly scheduled = new Map<string, ScheduledReminderNotification>();
  readonly configurePlatform = vi.fn(async () => undefined);
  readonly getPermissionStatus = vi.fn(async () => this.permission);
  readonly requestPermission = vi.fn(async () => this.permission);
  readonly listScheduled = vi.fn(async () => [...this.scheduled.values()]);
  readonly schedule = vi.fn(async (reminderId: string, scheduledAtEpochMs: number) => {
    this.scheduled.set(reminderId, {
      identifier: `mybaby.reminder.v1.${reminderId}`, reminderId, scheduledAtEpochMs,
    });
  });
  readonly cancel = vi.fn(async (reminderId: string) => {
    this.scheduled.delete(reminderId);
  });
}

describe('Reminder notification reconciliation', () => {
  it('selects the globally nearest 50 and is idempotent after convergence', async () => {
    const service = new FakeNotificationService();
    const source = Array.from({ length: 70 }, (_, index) =>
      reminder(String(69 - index).padStart(2, '0'), 2_000 + (69 - index),
        index % 2 === 0 ? 'child-a' : 'child-b'));
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => source,
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({
      status: 'synchronized', desiredCount: REMINDER_NOTIFICATION_PROJECTION_LIMIT,
      scheduledCount: REMINDER_NOTIFICATION_PROJECTION_LIMIT,
    });
    expect([...service.scheduled.keys()].sort()).toEqual(
      Array.from({ length: 50 }, (_, index) => String(index).padStart(2, '0')),
    );
    service.schedule.mockClear();
    service.cancel.mockClear();
    await coordinator.reconcile();
    expect(service.schedule).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
  });

  it('repairs stale edits, deleted reminders and expired owned schedules', async () => {
    const service = new FakeNotificationService();
    service.scheduled.set('edited', {
      identifier: 'mybaby.reminder.v1.edited', reminderId: 'edited', scheduledAtEpochMs: 2_000,
    });
    service.scheduled.set('deleted', {
      identifier: 'mybaby.reminder.v1.deleted', reminderId: 'deleted', scheduledAtEpochMs: 3_000,
    });
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => [reminder('edited', 4_000)],
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({ status: 'synchronized' });
    expect(service.cancel.mock.calls.map(([id]) => id).sort()).toEqual(['deleted', 'edited']);
    expect(service.schedule).toHaveBeenCalledWith('edited', 4_000);
    expect([...service.scheduled.values()]).toEqual([{
      identifier: 'mybaby.reminder.v1.edited', reminderId: 'edited', scheduledAtEpochMs: 4_000,
    }]);
  });

  it('recovers a lost scheduling response by inspecting the resulting OS request', async () => {
    const service = new FakeNotificationService();
    service.schedule.mockImplementationOnce(async (reminderId, scheduledAtEpochMs) => {
      service.scheduled.set(reminderId, {
        identifier: `mybaby.reminder.v1.${reminderId}`, reminderId, scheduledAtEpochMs,
      });
      throw new Error('response lost after native success');
    });
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => [reminder('saved', 4_000)],
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({
      status: 'synchronized', scheduledCount: 1,
    });
    await coordinator.reconcile();
    expect(service.schedule).toHaveBeenCalledOnce();
  });

  it('reports partial schedule and cancellation failures as degraded and later converges', async () => {
    const service = new FakeNotificationService();
    service.scheduled.set('orphan', {
      identifier: 'mybaby.reminder.v1.orphan', reminderId: 'orphan', scheduledAtEpochMs: 1_000,
    });
    service.cancel.mockRejectedValueOnce(new Error('cancel failed'));
    service.schedule.mockRejectedValueOnce(new Error('schedule failed'));
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => [reminder('wanted', 4_000)],
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({ status: 'degraded' });
    await expect(coordinator.reconcile()).resolves.toMatchObject({ status: 'synchronized' });
    expect([...service.scheduled.keys()]).toEqual(['wanted']);
  });

  it('does not mutate OS state when the canonical database read fails', async () => {
    const service = new FakeNotificationService();
    service.scheduled.set('keep', {
      identifier: 'mybaby.reminder.v1.keep', reminderId: 'keep', scheduledAtEpochMs: 1_000,
    });
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => { throw new Error('SQLCipher unavailable'); },
    });
    await expect(coordinator.reconcile()).resolves.toEqual({
      status: 'degraded', permission: null, desiredCount: 0, scheduledCount: 0,
    });
    expect(service.configurePlatform).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
    expect(service.schedule).not.toHaveBeenCalled();
    expect(service.scheduled.has('keep')).toBe(true);
  });

  it('never prompts automatically and clears the OS projection when permission is unavailable', async () => {
    const service = new FakeNotificationService();
    service.permission = 'denied';
    service.scheduled.set('existing', {
      identifier: 'mybaby.reminder.v1.existing', reminderId: 'existing', scheduledAtEpochMs: 4_000,
    });
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => [reminder('existing', 4_000)],
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({
      status: 'permission-unavailable', permission: 'denied', scheduledCount: 0,
    });
    expect(service.requestPermission).not.toHaveBeenCalled();
    expect(service.cancel).toHaveBeenCalledWith('existing');
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('shares one pending reconciliation and permanently stops new OS work after close', async () => {
    const service = new FakeNotificationService();
    const loading = deferred<readonly Reminder[]>();
    const load = vi.fn(() => loading.promise);
    const coordinator = createReminderNotificationCoordinator({
      service, loadCanonicalReminders: load,
    });
    const first = coordinator.reconcile();
    const second = coordinator.reconcile();
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledOnce();
    coordinator.close();
    loading.resolve([reminder('late', 4_000)]);
    await expect(first).resolves.toMatchObject({ status: 'closed' });
    await expect(coordinator.reconcile()).resolves.toMatchObject({ status: 'closed' });
    expect(service.configurePlatform).not.toHaveBeenCalled();
  });

  it('reschedules uninspectable iOS date triggers without relying on replacement behavior', async () => {
    const service = new FakeNotificationService();
    service.scheduled.set('ios', {
      identifier: 'mybaby.reminder.v1.ios', reminderId: 'ios', scheduledAtEpochMs: null,
    });
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => [reminder('ios', 4_000)],
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({ status: 'synchronized' });
    expect(service.cancel).toHaveBeenCalledWith('ios');
    expect(service.schedule).toHaveBeenCalledWith('ios', 4_000);
    expect(service.cancel.mock.invocationCallOrder[0])
      .toBeLessThan(service.schedule.mock.invocationCallOrder[0]!);
  });

  it('does not accept an uninspectable iOS schedule when required cancellation failed', async () => {
    const service = new FakeNotificationService();
    service.scheduled.set('ios', {
      identifier: 'mybaby.reminder.v1.ios', reminderId: 'ios', scheduledAtEpochMs: null,
    });
    service.cancel.mockRejectedValueOnce(new Error('cancellation failed'));
    const coordinator = createReminderNotificationCoordinator({
      service,
      loadCanonicalReminders: async () => [reminder('ios', 4_000)],
    });
    await expect(coordinator.reconcile()).resolves.toMatchObject({ status: 'degraded' });
    expect(service.schedule).not.toHaveBeenCalled();
  });
});
