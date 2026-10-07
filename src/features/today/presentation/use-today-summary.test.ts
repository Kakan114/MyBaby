import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayFixture } from './today-test-fixture';
const harness = vi.hoisted(() => ({
  read: vi.fn(),
  selection: undefined as undefined | ((switching: boolean) => void),
  focus: undefined as undefined | (() => () => void),
  app: undefined as undefined | ((state: string) => void),
  state: undefined as unknown,
  now: 0,
  removes: vi.fn(),
  unsubscribe: vi.fn(),
  effectCleanup: undefined as undefined | (() => void),
  stateIndex: 0,
}));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => () => void) => { harness.effectCleanup = effect(); },
  useState: (initial: unknown) => {
    const index = harness.stateIndex++;
    const value = typeof initial === 'function' ? initial() : initial;
    if (index === 0) harness.state = value;
    return [value, (next: unknown) => {
      if (index === 0) harness.state = next; else harness.now = next as number;
    }];
  },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) => { harness.focus = effect; },
}));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_: string, listener: (state: string) => void) => {
      harness.app = listener; return { remove: harness.removes };
    },
  },
}));
vi.mock('@/runtime/app-runtime-provider', () => ({
  useTodayRuntime: () => ({
    getSummary: harness.read,
    subscribeSelectionChange: (listener: (switching: boolean) => void) => {
      harness.selection = listener; return harness.unsubscribe;
    },
  }),
}));
import { useTodaySummary } from './use-today-summary';

let cleanup: (() => void) | undefined;
let previousZone: string | undefined;
const ready = { status: 'ready', summary: todayFixture() } as const;
beforeEach(() => {
  previousZone = process.env.TZ;
  process.env.TZ = 'UTC';
  vi.useFakeTimers(); vi.setSystemTime('2026-10-07T12:00:00Z');
  harness.stateIndex = 0;
  harness.read.mockReset().mockResolvedValue(ready);
  harness.removes.mockClear(); harness.unsubscribe.mockClear();
});
afterEach(() => {
  cleanup?.(); cleanup = undefined; harness.effectCleanup?.();
  vi.useRealTimers();
  if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone;
});
async function mount() {
  const hook = useTodaySummary(); cleanup = harness.focus!();
  expect(harness.state).toEqual({ status: 'loading' });
  await vi.advanceTimersByTimeAsync(0);
  return hook;
}
describe('Today focused lifecycle integration', () => {
  it('preserves ready content during tab-focus and resume refreshes', async () => {
    await mount(); cleanup!();
    harness.read.mockReturnValueOnce(new Promise(() => {})); cleanup = harness.focus!();
    expect(harness.state).toEqual(ready);
    harness.app!('background');
    harness.read.mockReturnValueOnce(new Promise(() => {})); harness.app!('active');
    expect(harness.state).toEqual(ready);
    expect(harness.read).toHaveBeenCalledTimes(3);
  });
  it('does not poll SQLite during local sleep ticks', async () => {
    const summary = todayFixture();
    harness.read.mockResolvedValue({ status: 'ready', summary: { ...summary,
      sleep: { ...summary.sleep, active: {
        session: { id: 'sleep', childId: 'mio', startedAtEpochMs: Date.now() - 1000 },
        elapsedMs: 1000, clockMovedBackward: false,
      } },
    } });
    await mount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.now).toBe(Date.now());
    expect(harness.read).toHaveBeenCalledOnce();
  });
  it('refreshes at local midnight without querying every tick', async () => {
    vi.setSystemTime('2026-10-07T23:59:59Z');
    await mount(); await vi.advanceTimersByTimeAsync(1000);
    expect(harness.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.read).toHaveBeenCalledTimes(2);
  });
  it('detects a timezone change locally and refreshes once', async () => {
    await mount(); process.env.TZ = 'Europe/Stockholm';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(harness.read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(harness.read).toHaveBeenCalledTimes(2);
  });
  it('stops updates and timers on blur, then reads on resume/focus', async () => {
    await mount(); cleanup!(); cleanup = undefined;
    const before = harness.now;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(harness.now).toBe(before);
    expect(harness.read).toHaveBeenCalledOnce();
    expect(harness.removes).toHaveBeenCalledOnce();
    cleanup = harness.focus!(); await vi.advanceTimersByTimeAsync(0);
    expect(harness.read).toHaveBeenCalledTimes(2);
  });
  it('invalidates child data even while blurred and unsubscribes on unmount', async () => {
    await mount(); cleanup!(); cleanup = undefined;
    harness.selection!(true);
    expect(harness.state).toEqual({ status: 'loading' });
    harness.read.mockResolvedValueOnce({ status: 'ready', summary: todayFixture('kim') });
    harness.selection!(false); cleanup = harness.focus!();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.state).toEqual({ status: 'ready', summary: todayFixture('kim') });
    harness.effectCleanup!();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    harness.effectCleanup = undefined;
  });
  it('backgrounding invalidates a pending result', async () => {
    let resolve!: (value: unknown) => void;
    harness.read.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
    await mount(); harness.app!('background');
    resolve(ready); await vi.advanceTimersByTimeAsync(0);
    expect(harness.state).toEqual({ status: 'loading' });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(harness.read).toHaveBeenCalledOnce();
  });
});
