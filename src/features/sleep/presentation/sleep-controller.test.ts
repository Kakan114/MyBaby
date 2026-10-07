import { describe, expect, it, vi } from 'vitest';

import type { SleepRuntime, SleepRuntimeState } from '@/runtime/app-runtime';

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
});
