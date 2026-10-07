import { describe, expect, it, vi } from 'vitest';
import type { TodaySummaryResult } from '../application/today-summary';
import { createTodayController } from './today-controller';
import { todayFixture } from './today-test-fixture';

function deferred() {
  let resolve!: (value: TodaySummaryResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<TodaySummaryResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ready = { status: 'ready', summary: todayFixture() } as const;
async function flush() { await Promise.resolve(); await Promise.resolve(); }
function fixture() {
  const read = vi.fn().mockResolvedValue(ready);
  const publish = vi.fn();
  const controller = createTodayController({ getSummary: read }, publish);
  return { read, publish, controller };
}
describe('Today snapshot lifecycle', () => {
  it('initially loads and accepts the atomic ready snapshot', async () => {
    const f = fixture(); f.controller.activate();
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'loading' });
    await flush();
    expect(f.publish).toHaveBeenLastCalledWith(ready);
  });
  it('keeps ready data on focus and resume, replacing it on success', async () => {
    const f = fixture(); f.controller.activate(); await flush();
    f.controller.deactivate();
    const pending = deferred(); f.read.mockReturnValueOnce(pending.promise);
    f.controller.activate();
    expect(f.publish).toHaveBeenLastCalledWith(ready);
    const replacement = { status: 'ready', summary: todayFixture('kim') } as const;
    pending.resolve(replacement); await flush();
    expect(f.publish).toHaveBeenLastCalledWith(replacement);
  });
  it.each(['missing', 'error'] as const)('removes ready data on %s and allows retry', async status => {
    const f = fixture(); f.controller.activate(); await flush();
    if (status === 'missing') f.read.mockResolvedValueOnce({ status: 'missing-active-child' });
    else f.read.mockRejectedValueOnce(new Error('secret database path'));
    await f.controller.refresh();
    expect(f.publish).toHaveBeenLastCalledWith({ status });
    const pending = deferred(); f.read.mockReturnValueOnce(pending.promise);
    const retry = f.controller.refresh(true);
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'loading' });
    pending.resolve(ready); await retry;
    expect(f.publish).toHaveBeenLastCalledWith(ready);
  });
  it('rejects an earlier completion after a newer refresh', async () => {
    const f = fixture(); const old = deferred();
    f.read.mockReturnValueOnce(old.promise); f.controller.activate();
    await f.controller.refresh();
    old.resolve({ status: 'ready', summary: todayFixture('kim') }); await flush();
    expect(f.publish).toHaveBeenLastCalledWith(ready);
  });
  it.each(['resolve', 'reject'] as const)('rejects %s after blur or unmount', async action => {
    const f = fixture(); const old = deferred(); f.read.mockReturnValueOnce(old.promise);
    f.controller.activate(); f.controller.deactivate(); f.publish.mockClear();
    if (action === 'resolve') old.resolve(ready); else old.reject(new Error('private'));
    await flush(); expect(f.publish).not.toHaveBeenCalled();
  });
  it('immediately hides the previous child and rejects requests during a switch', async () => {
    const f = fixture(); f.controller.activate(); await flush();
    const old = deferred(); f.read.mockReturnValueOnce(old.promise);
    void f.controller.refresh();
    f.controller.selectionChanged(true);
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'loading' });
    old.resolve(ready); await flush();
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'loading' });
    f.read.mockResolvedValueOnce({ status: 'ready', summary: todayFixture('kim') });
    f.controller.selectionChanged(false); await flush();
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'ready', summary: todayFixture('kim') });
  });
  it('a child switch while blurred prevents old content being preserved on focus', async () => {
    const f = fixture(); f.controller.activate(); await flush(); f.controller.deactivate();
    f.controller.selectionChanged(true); f.controller.selectionChanged(false);
    const next = deferred(); f.read.mockReturnValueOnce(next.promise); f.controller.activate();
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'loading' });
    next.resolve({ status: 'ready', summary: todayFixture('kim') }); await flush();
    expect(f.publish).toHaveBeenLastCalledWith({ status: 'ready', summary: todayFixture('kim') });
  });
});
