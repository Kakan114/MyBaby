import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedingHistoryRuntimeResult } from '@/runtime/app-runtime';

import { createFeedingHistoryController } from './feeding-history-controller';

function deferred() {
  let resolve!: (value: FeedingHistoryRuntimeResult) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<FeedingHistoryRuntimeResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

const firstResult: FeedingHistoryRuntimeResult = {
  childId: 'child-1',
  events: [{
    id: 'feeding-1', childId: 'child-1', occurredAtEpochMs: 100,
    kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
  }],
};
const secondResult: FeedingHistoryRuntimeResult = {
  childId: 'child-2',
  events: [{
    id: 'feeding-2', childId: 'child-2', occurredAtEpochMs: 200,
    kind: 'bottle', amountMl: 62.5, contents: 'mixed',
  }],
};

describe('feeding history controller', () => {
  let read: ReturnType<typeof vi.fn<() => Promise<FeedingHistoryRuntimeResult>>>;
  let states: unknown[];

  beforeEach(() => {
    read = vi.fn<() => Promise<FeedingHistoryRuntimeResult>>(async () => firstResult);
    states = [];
  });

  function mount() {
    const controller = createFeedingHistoryController({ getRecentFeedings: read });
    controller.mount((state) => states.push(state));
    return controller;
  }

  it('represents loading, populated, and empty results', async () => {
    const controller = mount();
    await controller.refresh();
    expect(states).toEqual([{ status: 'loading' }, { status: 'ready', result: firstResult }]);

    read.mockResolvedValueOnce({ childId: 'child-1', events: [] });
    await controller.refresh();
    expect(states.slice(-2)).toEqual([
      { status: 'loading' },
      { status: 'empty', childId: 'child-1' },
    ]);
  });

  it('shows a safe error state and retries the full read', async () => {
    read.mockRejectedValueOnce(new Error('raw SQLite/key/path'));
    const controller = mount();

    await controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'error' });
    await controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'ready', result: firstResult });
  });

  it('clears old-child results immediately and ignores their stale response', async () => {
    const oldChild = deferred();
    read.mockReturnValueOnce(oldChild.promise).mockResolvedValueOnce(secondResult);
    const controller = mount();

    const oldRefresh = controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'loading' });
    await controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'ready', result: secondResult });
    const count = states.length;
    oldChild.resolve(firstResult);
    await oldRefresh;
    expect(states).toHaveLength(count);
  });

  it('does not update after unmount', async () => {
    const pending = deferred();
    read.mockReturnValueOnce(pending.promise);
    const controller = mount();
    const refresh = controller.refresh();
    const count = states.length;
    controller.unmount();
    pending.resolve(firstResult);
    await refresh;
    expect(states).toHaveLength(count);
  });

  it('shows a newly saved feeding on the next refresh', async () => {
    read.mockResolvedValueOnce({ childId: 'child-1', events: [] });
    const controller = mount();
    await controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'empty', childId: 'child-1' });

    await controller.refresh();
    expect(states.at(-1)).toEqual({ status: 'ready', result: firstResult });
  });
});
