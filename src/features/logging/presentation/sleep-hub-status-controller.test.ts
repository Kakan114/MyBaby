import { describe, expect, it, vi } from 'vitest';

import type { SleepRuntimeState } from '@/runtime/app-runtime';

import {
  createSleepHubStatusController,
  type SleepHubStatusState,
} from './sleep-hub-status-controller';

const idle: SleepRuntimeState = {
  childId: 'child-b', active: null, events: [], nowEpochMs: 10_000,
  clockMovedBackward: false,
};
const sleeping: SleepRuntimeState = {
  childId: 'child-a',
  active: { id: 'sleep-a', childId: 'child-a', startedAtEpochMs: 10_000 },
  events: [], nowEpochMs: 20_000, clockMovedBackward: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Sleep hub status controller', () => {
  it('shows idle and process-restored active canonical states', async () => {
    const getState = vi.fn()
      .mockResolvedValueOnce(idle)
      .mockResolvedValueOnce(sleeping);
    const controller = createSleepHubStatusController({ getState });
    controller.mount(() => undefined);
    await controller.refresh();
    expect(controller.state).toEqual({ status: 'ready', value: idle });
    await controller.refresh();
    expect(controller.state).toEqual({ status: 'ready', value: sleeping });
  });

  it('ticks only the loaded projection and never performs persistence work', async () => {
    const getState = vi.fn(async () => sleeping);
    const controller = createSleepHubStatusController({ getState }, () => 90_000);
    controller.mount(() => undefined);
    await controller.refresh();
    controller.tick();
    expect(controller.state).toMatchObject({
      status: 'ready', value: { nowEpochMs: 90_000, active: { id: 'sleep-a' } },
    });
    expect(getState).toHaveBeenCalledOnce();
  });

  it('clears A before loading B and ignores A when its stale request resolves last', async () => {
    const a = deferred<SleepRuntimeState>();
    const b = deferred<SleepRuntimeState>();
    const getState = vi.fn()
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);
    const states: SleepHubStatusState[] = [];
    const controller = createSleepHubStatusController({ getState });
    controller.mount((state) => states.push(state));
    const loadA = controller.refresh();
    const loadB = controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'loading' });
    b.resolve(idle);
    await loadB;
    a.resolve(sleeping);
    await loadA;
    expect(controller.state).toEqual({ status: 'ready', value: idle });
  });

  it('restores A when a later focus refresh resolves it again', async () => {
    const getState = vi.fn()
      .mockResolvedValueOnce(sleeping)
      .mockResolvedValueOnce(idle)
      .mockResolvedValueOnce(sleeping);
    const controller = createSleepHubStatusController({ getState });
    controller.mount(() => undefined);
    await controller.refresh();
    await controller.refresh();
    expect(controller.state).toEqual({ status: 'ready', value: idle });
    await controller.refresh();
    expect(controller.state).toEqual({ status: 'ready', value: sleeping });
  });

  it('never shows negative elapsed projection after a backward clock move', async () => {
    const controller = createSleepHubStatusController({
      getState: async () => sleeping,
    }, () => 5_000);
    controller.mount(() => undefined);
    await controller.refresh();
    controller.tick();
    expect(controller.state).toMatchObject({
      status: 'ready', value: { nowEpochMs: 5_000, clockMovedBackward: true },
    });
  });
});
