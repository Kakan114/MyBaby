import { describe, expect, it, vi } from 'vitest';

import type { SleepRuntime, SleepRuntimeState } from '@/runtime/app-runtime';
import { SleepApplicationError } from '../application/sleep';

import { createSleepController, type SleepPresentationState } from './sleep-controller';

const idle: SleepRuntimeState = {
  childId: 'child-1', active: null, events: [], nowEpochMs: 1_000,
  clockMovedBackward: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('sleep controller', () => {
  it('loads, starts, ticks from canonical start, and prevents duplicate mutations', async () => {
    const pending = deferred<SleepRuntimeState>();
    const active: SleepRuntimeState = {
      ...idle,
      active: { id: 'sleep-1', childId: 'child-1', startedAtEpochMs: 1_000 },
    };
    const runtime: SleepRuntime = {
      getState: vi.fn(async () => idle),
      start: vi.fn(() => pending.promise),
      complete: vi.fn(async () => idle),
      discard: vi.fn(async () => idle),
      recordCompleted: vi.fn(async () => idle),
    };
    const states: SleepPresentationState[] = [];
    const controller = createSleepController(runtime, () => 61_000);
    controller.mount((state) => states.push(state));
    await controller.refresh();
    const first = controller.start();
    const duplicate = controller.start();
    expect(runtime.start).toHaveBeenCalledOnce();
    pending.resolve(active);
    await Promise.all([first, duplicate]);
    controller.tick();
    expect(controller.state).toMatchObject({
      status: 'ready', value: { nowEpochMs: 61_000, clockMovedBackward: false },
    });
  });

  it('rereads canonical state after an uncertain mutation outcome', async () => {
    const runtime: SleepRuntime = {
      getState: vi.fn(async () => idle),
      start: vi.fn(async () => { throw new Error('uncertain'); }),
      complete: vi.fn(async () => idle),
      discard: vi.fn(async () => idle),
      recordCompleted: vi.fn(async () => idle),
    };
    const controller = createSleepController(runtime);
    controller.mount(() => undefined);
    await controller.start();
    expect(runtime.getState).toHaveBeenCalledOnce();
    expect(controller.state).toMatchObject({ status: 'ready', checkedAfterFailure: true });
  });

  it('ignores stale completion after unmount', async () => {
    const pending = deferred<SleepRuntimeState>();
    const listener = vi.fn();
    const runtime: SleepRuntime = {
      getState: vi.fn(() => pending.promise),
      start: vi.fn(async () => idle), complete: vi.fn(async () => idle),
      discard: vi.fn(async () => idle),
      recordCompleted: vi.fn(async () => idle),
    };
    const controller = createSleepController(runtime);
    controller.mount(listener);
    const refresh = controller.refresh();
    controller.unmount();
    pending.resolve(idle);
    await refresh;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ status: 'loading' });
  });

  it('blocks duplicate manual submissions synchronously and publishes refreshed history', async () => {
    const pending = deferred<SleepRuntimeState>();
    const saved: SleepRuntimeState = {
      ...idle,
      events: [{
        id: 'manual-1', childId: 'child-1', startedAtEpochMs: 100,
        endedAtEpochMs: 200,
      }],
    };
    const runtime: SleepRuntime = {
      getState: vi.fn(async () => idle),
      start: vi.fn(async () => idle),
      complete: vi.fn(async () => idle),
      discard: vi.fn(async () => idle),
      recordCompleted: vi.fn(() => pending.promise),
    };
    const controller = createSleepController(runtime);
    controller.mount(() => undefined);
    const first = controller.recordCompleted(100, 200);
    await expect(controller.recordCompleted(100, 200)).resolves.toBe('busy');
    expect(runtime.recordCompleted).toHaveBeenCalledOnce();
    pending.resolve(saved);
    await expect(first).resolves.toBe('saved');
    expect(controller.state).toMatchObject({ status: 'ready', value: saved });
  });

  it('keeps manual drafts retryable only after confirmed absence and locks uncertain outcomes', async () => {
    const recordCompleted = vi.fn(async () => {
      throw new SleepApplicationError('completed-sleep-not-saved');
    });
    const runtime: SleepRuntime = {
      getState: vi.fn(async () => idle),
      start: vi.fn(async () => idle),
      complete: vi.fn(async () => idle),
      discard: vi.fn(async () => idle),
      recordCompleted,
    };
    const controller = createSleepController(runtime);
    controller.mount(() => undefined);
    await expect(controller.recordCompleted(100, 200)).resolves.toBe('confirmed-not-saved');
    recordCompleted.mockImplementationOnce(async () => {
      throw new SleepApplicationError('completed-sleep-outcome-uncertain');
    });
    await expect(controller.recordCompleted(100, 200)).resolves.toBe('uncertain');
  });

  it('does not publish stale manual success after a newer canonical refresh starts', async () => {
    const pendingSave = deferred<SleepRuntimeState>();
    const pendingRefresh = deferred<SleepRuntimeState>();
    const runtime: SleepRuntime = {
      getState: vi.fn(() => pendingRefresh.promise),
      start: vi.fn(async () => idle),
      complete: vi.fn(async () => idle),
      discard: vi.fn(async () => idle),
      recordCompleted: vi.fn(() => pendingSave.promise),
    };
    const controller = createSleepController(runtime);
    controller.mount(() => undefined);
    const save = controller.recordCompleted(100, 200);
    const refresh = controller.refresh();
    pendingSave.resolve({ ...idle, events: [{
      id: 'old-child-event', childId: 'child-1',
      startedAtEpochMs: 100, endedAtEpochMs: 200,
    }] });
    await expect(save).resolves.toBe('uncertain');
    pendingRefresh.resolve({ ...idle, childId: 'child-2' });
    await refresh;
    expect(controller.state).toMatchObject({
      status: 'ready', value: { childId: 'child-2' },
    });
  });
});
