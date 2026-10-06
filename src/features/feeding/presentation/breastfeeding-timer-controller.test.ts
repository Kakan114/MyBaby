import { describe, expect, it, vi } from 'vitest';

import type {
  BreastfeedingTimerRuntimeState,
  FeedingRuntime,
} from '@/runtime/app-runtime';

import { createBreastfeedingTimerController } from './breastfeeding-timer-controller';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const running: BreastfeedingTimerRuntimeState = {
  status: 'ready',
  clockMovedBackward: false,
  session: {
    sessionId: 'session-1',
    childId: 'child-1',
    status: 'running',
    activeSide: 'left',
    accumulatedLeftMs: 5_000,
    accumulatedRightMs: 2_000,
    segmentStartedAtEpochMs: 1_000_000,
  },
};

const finished: BreastfeedingTimerRuntimeState = {
  status: 'ready',
  clockMovedBackward: false,
  session: {
    sessionId: 'session-1',
    childId: 'child-1',
    status: 'finished',
    accumulatedLeftMs: 10_000,
    accumulatedRightMs: 20_000,
    finishedAtEpochMs: 1_030_000,
  },
};

const paused: BreastfeedingTimerRuntimeState = {
  status: 'ready',
  clockMovedBackward: false,
  session: {
    sessionId: 'session-1',
    childId: 'child-1',
    status: 'paused',
    resumeSide: 'right',
    accumulatedLeftMs: 10_000,
    accumulatedRightMs: 20_000,
  },
};

function runtimeFixture() {
  return {
    recordFeeding: vi.fn<FeedingRuntime['recordFeeding']>(),
    getBreastfeedingTimer: vi.fn<FeedingRuntime['getBreastfeedingTimer']>(
      async () => ({ status: 'idle' }),
    ),
    startBreastfeedingTimer: vi.fn<FeedingRuntime['startBreastfeedingTimer']>(
      async () => running,
    ),
    pauseBreastfeedingTimer: vi.fn<FeedingRuntime['pauseBreastfeedingTimer']>(
      async () => running,
    ),
    resumeBreastfeedingTimer: vi.fn<FeedingRuntime['resumeBreastfeedingTimer']>(
      async () => running,
    ),
    switchBreastfeedingSide: vi.fn<FeedingRuntime['switchBreastfeedingSide']>(
      async () => running,
    ),
    finishBreastfeedingTimer: vi.fn<FeedingRuntime['finishBreastfeedingTimer']>(
      async () => finished,
    ),
    discardBreastfeedingTimer: vi.fn<FeedingRuntime['discardBreastfeedingTimer']>(
      async () => ({ status: 'idle' }),
    ),
    saveFinishedBreastfeedingTimer:
      vi.fn<FeedingRuntime['saveFinishedBreastfeedingTimer']>(),
  } satisfies FeedingRuntime;
}

describe('breastfeeding timer presentation controller', () => {
  it('restores persisted state and uses ticks only for elapsed projection', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer.mockResolvedValue(running);
    let now = 1_010_000;
    const controller = createBreastfeedingTimerController(runtime, () => now);
    controller.mount(() => undefined);

    await controller.refresh();
    expect(controller.state).toMatchObject({
      status: 'session',
      projected: { leftMs: 15_000, rightMs: 2_000 },
    });
    now = 1_020_000;
    controller.tick();
    expect(controller.state).toMatchObject({
      projected: { leftMs: 25_000, rightMs: 2_000 },
    });
    expect(runtime.getBreastfeedingTimer).toHaveBeenCalledOnce();
    expect(runtime.pauseBreastfeedingTimer).not.toHaveBeenCalled();
  });

  it.each([running, paused, finished])(
    'restores $session.status state after provider-style unmount and remount',
    async (persisted) => {
      const runtime = runtimeFixture();
      runtime.getBreastfeedingTimer.mockResolvedValue(persisted);
      const first = createBreastfeedingTimerController(runtime, () => 1_030_000);
      first.mount(() => undefined);
      await first.refresh();
      first.unmount();

      const remounted = createBreastfeedingTimerController(runtime, () => 1_030_000);
      remounted.mount(() => undefined);
      await remounted.refresh();
      expect(remounted.state).toMatchObject({
        status: 'session',
        runtimeState: { session: { status: persisted.session.status } },
      });
    },
  );

  it('synchronously blocks duplicate actions', async () => {
    const runtime = runtimeFixture();
    const result = deferred<BreastfeedingTimerRuntimeState>();
    runtime.startBreastfeedingTimer.mockReturnValue(result.promise);
    const controller = createBreastfeedingTimerController(runtime, () => 1_000_000);
    controller.mount(() => undefined);

    const first = controller.start('left');
    const duplicate = controller.start('left');
    expect(runtime.startBreastfeedingTimer).toHaveBeenCalledOnce();
    result.resolve(running);
    await Promise.all([first, duplicate]);
    expect(controller.state.status).toBe('session');
  });

  it('ignores superseded refresh results and updates after unmount', async () => {
    const runtime = runtimeFixture();
    const stale = deferred<BreastfeedingTimerRuntimeState>();
    runtime.getBreastfeedingTimer
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(running);
    const listener = vi.fn();
    const controller = createBreastfeedingTimerController(runtime, () => 1_010_000);
    controller.mount(listener);

    const refresh = controller.refresh();
    await controller.refresh();
    stale.resolve({ status: 'idle' });
    await refresh;
    expect(controller.state.status).toBe('session');

    const pending = deferred<BreastfeedingTimerRuntimeState>();
    runtime.getBreastfeedingTimer.mockReturnValueOnce(pending.promise);
    const secondRefresh = controller.refresh();
    controller.unmount();
    const callsAtUnmount = listener.mock.calls.length;
    pending.resolve({ status: 'idle' });
    await secondRefresh;
    expect(listener).toHaveBeenCalledTimes(callsAtUnmount);
  });

  it('re-reads authoritative state after an uncertain save outcome', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer
      .mockResolvedValueOnce(finished)
      .mockResolvedValueOnce({ status: 'idle' });
    runtime.saveFinishedBreastfeedingTimer.mockRejectedValueOnce(
      new Error('uncertain native response'),
    );
    const controller = createBreastfeedingTimerController(runtime, () => 1_030_000);
    controller.mount(() => undefined);
    await controller.refresh();

    const first = controller.save();
    const duplicate = controller.save();
    await Promise.all([first, duplicate]);

    expect(runtime.saveFinishedBreastfeedingTimer).toHaveBeenCalledOnce();
    expect(runtime.getBreastfeedingTimer).toHaveBeenCalledTimes(2);
    expect(controller.state).toEqual({ status: 'saved' });
  });

  it('retains a recoverable finished session after a rolled-back save failure', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer.mockResolvedValue(finished);
    runtime.saveFinishedBreastfeedingTimer.mockRejectedValueOnce(
      new Error('commit failed and rolled back'),
    );
    const controller = createBreastfeedingTimerController(runtime, () => 1_030_000);
    controller.mount(() => undefined);
    await controller.refresh();

    await controller.save();

    expect(runtime.saveFinishedBreastfeedingTimer).toHaveBeenCalledOnce();
    expect(runtime.getBreastfeedingTimer).toHaveBeenCalledTimes(2);
    expect(controller.state).toMatchObject({
      status: 'session',
      runtimeState: { session: { status: 'finished' } },
      issue: 'uncertain',
    });
  });

  it('synchronously blocks duplicate discard taps', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer.mockResolvedValueOnce(running);
    const discardResult = deferred<BreastfeedingTimerRuntimeState>();
    runtime.discardBreastfeedingTimer.mockReturnValueOnce(discardResult.promise);
    const controller = createBreastfeedingTimerController(runtime, () => 1_010_000);
    controller.mount(() => undefined);
    await controller.refresh();

    const first = controller.discard();
    const duplicate = controller.discard();
    expect(runtime.discardBreastfeedingTimer).toHaveBeenCalledOnce();
    discardResult.resolve({ status: 'idle' });
    await Promise.all([first, duplicate]);
    expect(controller.state).toEqual({ status: 'idle' });
  });

  it('re-reads authoritative state after an uncertain discard outcome', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer
      .mockResolvedValueOnce(paused)
      .mockResolvedValueOnce({ status: 'idle' });
    runtime.discardBreastfeedingTimer.mockRejectedValueOnce(
      new Error('uncertain delete response'),
    );
    const controller = createBreastfeedingTimerController(runtime, () => 1_030_000);
    controller.mount(() => undefined);
    await controller.refresh();

    await controller.discard();

    expect(runtime.discardBreastfeedingTimer).toHaveBeenCalledOnce();
    expect(runtime.getBreastfeedingTimer).toHaveBeenCalledTimes(2);
    expect(controller.state).toEqual({ status: 'idle' });
  });

  it('retains the session when a failed discard did not delete it', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer.mockResolvedValue(paused);
    runtime.discardBreastfeedingTimer.mockRejectedValueOnce(
      new Error('delete failed'),
    );
    const controller = createBreastfeedingTimerController(runtime, () => 1_030_000);
    controller.mount(() => undefined);
    await controller.refresh();

    await controller.discard();

    expect(controller.state).toMatchObject({
      status: 'session',
      runtimeState: { session: { status: 'paused' } },
      issue: 'uncertain',
    });
  });

  it('shows safe ownership, clock, and infrastructure states', async () => {
    const runtime = runtimeFixture();
    runtime.getBreastfeedingTimer.mockResolvedValueOnce({
      ...running,
      status: 'active-child-mismatch',
    });
    const controller = createBreastfeedingTimerController(runtime, () => 900_000);
    controller.mount(() => undefined);
    await controller.refresh();
    expect(controller.state).toMatchObject({ status: 'session', issue: 'ownership' });

    runtime.getBreastfeedingTimer.mockRejectedValueOnce(new Error('raw infrastructure'));
    await controller.refresh();
    expect(controller.state).toEqual({ status: 'error' });
  });
});
