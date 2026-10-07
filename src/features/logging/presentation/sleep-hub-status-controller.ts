import type { SleepRuntime, SleepRuntimeState } from '@/runtime/app-runtime';

export type SleepHubStatusState =
  | Readonly<{ status: 'loading' | 'unavailable' }>
  | Readonly<{ status: 'ready'; value: SleepRuntimeState }>;

type ReadSleepRuntime = Pick<SleepRuntime, 'getState'>;
type Listener = (state: SleepHubStatusState) => void;

export function createSleepHubStatusController(
  runtime: ReadSleepRuntime,
  now: () => number = Date.now,
) {
  let state: SleepHubStatusState = { status: 'loading' };
  let listener: Listener | null = null;
  let requestId = 0;

  const emit = (next: SleepHubStatusState) => {
    state = next;
    listener?.(next);
  };

  async function refresh(): Promise<void> {
    const request = ++requestId;
    // Never retain a previous child's session while current ownership is resolved.
    emit({ status: 'loading' });
    try {
      const value = await runtime.getState();
      if (listener !== null && requestId === request) {
        emit({ status: 'ready', value });
      }
    } catch {
      if (listener !== null && requestId === request) {
        emit({ status: 'unavailable' });
      }
    }
  }

  function tick(): void {
    if (state.status !== 'ready' || state.value.active === null) return;
    const nowEpochMs = now();
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) return;
    emit({
      status: 'ready',
      value: {
        ...state.value,
        nowEpochMs,
        clockMovedBackward: nowEpochMs < state.value.active.startedAtEpochMs,
      },
    });
  }

  return {
    get state() { return state; },
    mount(next: Listener) { listener = next; },
    unmount() { listener = null; requestId += 1; },
    refresh,
    tick,
  };
}
