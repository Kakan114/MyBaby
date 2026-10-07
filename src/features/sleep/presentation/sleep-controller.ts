import type { SleepRuntime, SleepRuntimeState } from '@/runtime/app-runtime';
import { SleepApplicationError } from '../application/sleep';

export type SleepPresentationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; value: SleepRuntimeState; busy: boolean; checkedAfterFailure: boolean }>
  | Readonly<{ status: 'error' }>;

type Listener = (state: SleepPresentationState) => void;

export type ManualSleepRecordResult =
  | 'saved'
  | 'future'
  | 'overlap'
  | 'confirmed-not-saved'
  | 'uncertain'
  | 'busy';

export function createSleepController(
  runtime: SleepRuntime,
  now: () => number = Date.now,
) {
  let state: SleepPresentationState = { status: 'loading' };
  let listener: Listener | null = null;
  let requestId = 0;
  let busy = false;

  const emit = (next: SleepPresentationState) => { state = next; listener?.(next); };

  async function refresh(showLoading = true): Promise<void> {
    const request = ++requestId;
    if (showLoading) emit({ status: 'loading' });
    try {
      const value = await runtime.getState();
      if (listener !== null && request === requestId) {
        emit({ status: 'ready', value, busy: false, checkedAfterFailure: false });
      }
    } catch {
      if (listener !== null && request === requestId) emit({ status: 'error' });
    }
  }

  async function mutate(operation: () => Promise<SleepRuntimeState>): Promise<void> {
    if (busy) return;
    busy = true;
    const request = ++requestId;
    if (state.status === 'ready') emit({ ...state, busy: true });
    try {
      const value = await operation();
      if (listener !== null && request === requestId) {
        emit({ status: 'ready', value, busy: false, checkedAfterFailure: false });
      }
    } catch {
      try {
        const value = await runtime.getState();
        if (listener !== null && request === requestId) {
          emit({ status: 'ready', value, busy: false, checkedAfterFailure: true });
        }
      } catch {
        if (listener !== null && request === requestId) emit({ status: 'error' });
      }
    } finally {
      busy = false;
    }
  }

  async function recordCompleted(
    startedAtEpochMs: number,
    endedAtEpochMs: number,
  ): Promise<ManualSleepRecordResult> {
    if (busy) return 'busy';
    busy = true;
    const request = ++requestId;
    const previous = state;
    if (state.status === 'ready') emit({ ...state, busy: true });
    try {
      const value = await runtime.recordCompleted({ startedAtEpochMs, endedAtEpochMs });
      if (listener !== null && request === requestId) {
        emit({ status: 'ready', value, busy: false, checkedAfterFailure: false });
        return 'saved';
      }
      return 'uncertain';
    } catch (error) {
      if (listener !== null && request === requestId && previous.status === 'ready') {
        emit({ ...previous, busy: false });
      }
      if (listener === null || request !== requestId) return 'uncertain';
      if (error instanceof SleepApplicationError) {
        if (error.code === 'future-completed-sleep') return 'future';
        if (error.code === 'overlaps-active-sleep') return 'overlap';
        if (error.code === 'completed-sleep-not-saved') return 'confirmed-not-saved';
      }
      return 'uncertain';
    } finally {
      busy = false;
    }
  }

  function tick(): void {
    if (state.status !== 'ready' || state.value.active === null) return;
    const nowEpochMs = now();
    if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 0) return;
    emit({
      ...state,
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
    start: () => mutate(runtime.start),
    complete: () => {
      const sessionId = state.status === 'ready' ? state.value.active?.id : undefined;
      return sessionId === undefined
        ? Promise.resolve()
        : mutate(() => runtime.complete(sessionId));
    },
    discard: () => {
      const sessionId = state.status === 'ready' ? state.value.active?.id : undefined;
      return sessionId === undefined
        ? Promise.resolve()
        : mutate(() => runtime.discard(sessionId));
    },
    recordCompleted,
  };
}
