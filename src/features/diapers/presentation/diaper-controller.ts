import type { DiaperRecordInput, DiaperRuntime, DiaperRuntimeState } from '@/runtime/app-runtime';
import { DiaperApplicationError } from '../application/diaper';
import type { DiaperKind } from '../domain/diaper-event';

export const DIAPER_SUCCESS_FEEDBACK_MS = 5_000;

export type DiaperFeedback =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'saved'; event: Readonly<{
      id: string; childId: string; occurredAtEpochMs: number; kind: DiaperKind;
    }>; undoFailed: boolean }>
  | Readonly<{ status: 'notice'; kind: 'recorded' | 'undone' | 'updated' | 'deleted' }>
  | Readonly<{ status: 'not-saved' }>
  | Readonly<{ status: 'uncertain' }>;

export type DiaperPresentationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error' }>
  | Readonly<{
      status: 'ready';
      value: DiaperRuntimeState;
      busy: boolean;
      feedback: DiaperFeedback;
    }>;

export type DiaperRecordResult = 'saved' | 'future' | 'not-saved' | 'uncertain' | 'busy';
export type DiaperMutationResult =
  | 'success' | 'future' | 'not-applied' | 'conflict' | 'uncertain' | 'busy';
type Listener = (state: DiaperPresentationState) => void;
type FeedbackTimer = ReturnType<typeof setTimeout>;

export function createDiaperController(
  runtime: DiaperRuntime,
  timers: Readonly<{
    schedule(callback: () => void, delayMs: number): FeedbackTimer;
    cancel(timer: FeedbackTimer): void;
  }> = { schedule: setTimeout, cancel: clearTimeout },
) {
  let state: DiaperPresentationState = { status: 'loading' };
  let listener: Listener | null = null;
  let requestId = 0;
  let busy = false;
  let feedbackTimer: FeedbackTimer | null = null;
  let feedbackTimerVersion = 0;
  const emit = (next: DiaperPresentationState) => { state = next; listener?.(next); };

  function cancelFeedbackTimer(): void {
    feedbackTimerVersion += 1;
    if (feedbackTimer !== null) {
      timers.cancel(feedbackTimer);
      feedbackTimer = null;
    }
  }

  function clearTransientSuccess(emitChange = true): void {
    cancelFeedbackTimer();
    if (state.status === 'ready' &&
      (state.feedback.status === 'saved' || state.feedback.status === 'notice')) {
      const next = { ...state, feedback: { status: 'idle' } as const };
      if (emitChange) emit(next); else state = next;
    }
  }

  function scheduleSuccessClear(): void {
    cancelFeedbackTimer();
    const version = feedbackTimerVersion;
    feedbackTimer = timers.schedule(() => {
      if (version !== feedbackTimerVersion) return;
      feedbackTimer = null;
      if (listener !== null && state.status === 'ready' &&
        (state.feedback.status === 'saved' || state.feedback.status === 'notice')) {
        emit({ ...state, feedback: { status: 'idle' } });
      }
    }, DIAPER_SUCCESS_FEEDBACK_MS);
  }

  async function refresh(): Promise<void> {
    cancelFeedbackTimer();
    const request = ++requestId;
    emit({ status: 'loading' });
    try {
      const value = await runtime.getState();
      if (listener !== null && request === requestId) {
        emit({ status: 'ready', value, busy: false, feedback: { status: 'idle' } });
      }
    } catch {
      if (listener !== null && request === requestId) emit({ status: 'error' });
    }
  }

  async function record(input: DiaperRecordInput): Promise<DiaperRecordResult> {
    if (busy) return 'busy';
    busy = true;
    clearTransientSuccess();
    const request = ++requestId;
    const previous = state;
    if (state.status === 'ready') emit({ ...state, busy: true });
    try {
      const result = await runtime.record(input);
      if (listener === null || request !== requestId) return 'uncertain';
      emit({
        status: 'ready',
        value: result.state,
        busy: false,
        feedback: input.timing === 'now'
          ? { status: 'saved', event: result.recordedEvent, undoFailed: false }
          : { status: 'notice', kind: 'recorded' },
      });
      scheduleSuccessClear();
      return 'saved';
    } catch (error) {
      if (listener === null || request !== requestId) return 'uncertain';
      if (previous.status === 'ready') {
        const feedback: DiaperFeedback = error instanceof DiaperApplicationError
          ? error.code === 'future-diaper'
            ? { status: 'idle' }
            : error.code === 'diaper-not-saved'
              ? { status: 'not-saved' }
              : { status: 'uncertain' }
          : { status: 'uncertain' };
        emit({ ...previous, busy: false, feedback });
      }
      if (error instanceof DiaperApplicationError) {
        if (error.code === 'future-diaper') return 'future';
        if (error.code === 'diaper-not-saved') return 'not-saved';
      }
      return 'uncertain';
    } finally {
      busy = false;
    }
  }

  function mutationErrorResult(error: unknown): DiaperMutationResult {
    if (!(error instanceof DiaperApplicationError)) return 'uncertain';
    if (error.code === 'future-diaper') return 'future';
    if (error.code === 'diaper-delete-not-applied' ||
      error.code === 'diaper-update-not-applied') return 'not-applied';
    if (error.code === 'diaper-event-not-found' ||
      error.code === 'diaper-event-changed') return 'conflict';
    return 'uncertain';
  }

  async function mutate(
    operation: () => Promise<DiaperRuntimeState>,
    notice: 'undone' | 'updated' | 'deleted',
  ): Promise<DiaperMutationResult> {
    if (busy) return 'busy';
    busy = true;
    cancelFeedbackTimer();
    const request = ++requestId;
    const previous = state;
    if (state.status === 'ready') emit({ ...state, busy: true });
    try {
      const value = await operation();
      if (listener === null || request !== requestId) return 'uncertain';
      emit({ status: 'ready', value, busy: false, feedback: { status: 'notice', kind: notice } });
      scheduleSuccessClear();
      return 'success';
    } catch (error) {
      const result = mutationErrorResult(error);
      if (listener !== null && request === requestId && previous.status === 'ready') {
        emit({
          ...previous,
          busy: false,
          feedback: result === 'uncertain' || result === 'conflict'
            ? { status: 'uncertain' }
            : previous.feedback,
        });
      }
      return listener === null || request !== requestId ? 'uncertain' : result;
    } finally {
      busy = false;
    }
  }

  async function undo(): Promise<DiaperMutationResult> {
    if (state.status !== 'ready' || state.feedback.status !== 'saved') return 'conflict';
    const expected = state.feedback.event;
    const result = await mutate(() => runtime.delete(expected), 'undone');
    if (result === 'not-applied' && state.status === 'ready' &&
      state.feedback.status === 'saved' && state.feedback.event.id === expected.id) {
      emit({ ...state, feedback: { ...state.feedback, undoFailed: true } });
    }
    return result;
  }

  return {
    get state() { return state; },
    mount(next: Listener) { listener = next; },
    unmount() {
      listener = null;
      requestId += 1;
      clearTransientSuccess(false);
    },
    refresh,
    record,
    undo,
    deleteEvent: (expected: Parameters<DiaperRuntime['delete']>[0]) =>
      mutate(() => runtime.delete(expected), 'deleted'),
    updateEvent: (input: Parameters<DiaperRuntime['update']>[0]) =>
      mutate(() => runtime.update(input), 'updated'),
    clearFeedback() {
      cancelFeedbackTimer();
      if (state.status === 'ready' && state.feedback.status !== 'uncertain') {
        emit({ ...state, feedback: { status: 'idle' } });
      }
    },
  };
}
