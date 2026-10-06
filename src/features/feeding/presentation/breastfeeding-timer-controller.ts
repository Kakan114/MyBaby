import type {
  BreastfeedingTimerRuntimeState,
  FeedingRuntime,
} from '@/runtime/app-runtime';

import {
  projectBreastfeedingDuration,
  type BreastSide,
  type ProjectedBreastfeedingDuration,
} from '../domain/breastfeeding-timer';

export type BreastfeedingTimerPresentationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'session';
      runtimeState: Exclude<BreastfeedingTimerRuntimeState, { status: 'idle' }>;
      projected: ProjectedBreastfeedingDuration;
      pending: boolean;
      issue?: 'clock' | 'ownership' | 'duration-too-short' | 'uncertain';
    }>
  | Readonly<{ status: 'saved' }>
  | Readonly<{ status: 'error' }>;

type SessionPresentationState = Extract<
  BreastfeedingTimerPresentationState,
  { status: 'session' }
>;
type SessionRuntimeState = Exclude<BreastfeedingTimerRuntimeState, { status: 'idle' }>;

type StateListener = (state: BreastfeedingTimerPresentationState) => void;

function sessionStateFromRuntime(
  runtimeState: SessionRuntimeState,
  now: () => number,
): SessionPresentationState {
  const projected = projectBreastfeedingDuration(runtimeState.session, now());
  return {
    status: 'session',
    runtimeState,
    projected,
    pending: false,
    issue: runtimeState.status === 'active-child-mismatch'
      ? 'ownership'
      : runtimeState.clockMovedBackward || projected.clockMovedBackward
        ? 'clock'
        : undefined,
  };
}

function stateFromRuntime(
  runtimeState: BreastfeedingTimerRuntimeState,
  now: () => number,
): BreastfeedingTimerPresentationState {
  return runtimeState.status === 'idle'
    ? { status: 'idle' }
    : sessionStateFromRuntime(runtimeState, now);
}

export function createBreastfeedingTimerController(
  runtime: FeedingRuntime,
  now: () => number = Date.now,
) {
  let state: BreastfeedingTimerPresentationState = { status: 'loading' };
  let listener: StateListener | null = null;
  let request = 0;
  let locked = false;
  let refreshesInFlight = 0;

  function emit(next: BreastfeedingTimerPresentationState) {
    state = next;
    listener?.(next);
  }

  async function refresh(): Promise<void> {
    if (locked) return;
    const currentRequest = ++request;
    refreshesInFlight += 1;
    try {
      const next = await runtime.getBreastfeedingTimer();
      if (listener !== null && request === currentRequest) {
        emit(stateFromRuntime(next, now));
      }
    } catch {
      if (listener !== null && request === currentRequest) emit({ status: 'error' });
    } finally {
      refreshesInFlight -= 1;
    }
  }

  async function perform(
    operation: () => Promise<BreastfeedingTimerRuntimeState>,
    isSave = false,
  ): Promise<void> {
    if (locked || refreshesInFlight > 0) return;
    locked = true;
    const currentRequest = ++request;
    if (state.status === 'session') emit({ ...state, pending: true });

    try {
      const next = await operation();
      if (listener !== null && request === currentRequest) {
        emit(isSave ? { status: 'saved' } : stateFromRuntime(next, now));
      }
    } catch (error) {
      if (listener === null || request !== currentRequest) return;
      try {
        const authoritative = await runtime.getBreastfeedingTimer();
        if (listener === null || request !== currentRequest) return;
        if (isSave && authoritative.status === 'idle') {
          emit({ status: 'saved' });
        } else if (authoritative.status === 'idle') {
          emit({ status: 'idle' });
        } else {
          const next = sessionStateFromRuntime(authoritative, now);
          const durationTooShort =
            typeof error === 'object' && error !== null &&
            'code' in error && error.code === 'duration-too-short';
          emit({
            ...next,
            issue: durationTooShort ? 'duration-too-short' : 'uncertain',
          });
        }
      } catch {
        if (listener !== null && request === currentRequest) emit({ status: 'error' });
      }
    } finally {
      locked = false;
    }
  }

  return {
    get state() { return state; },
    mount(nextListener: StateListener) { listener = nextListener; },
    unmount() { listener = null; request += 1; },
    refresh,
    start: (side: BreastSide) => perform(() => runtime.startBreastfeedingTimer(side)),
    pause: () => perform(() => runtime.pauseBreastfeedingTimer()),
    resume: () => perform(() => runtime.resumeBreastfeedingTimer()),
    switchSide: () => perform(() => runtime.switchBreastfeedingSide()),
    finish: () => perform(() => runtime.finishBreastfeedingTimer()),
    discard: () => perform(() => runtime.discardBreastfeedingTimer()),
    save: () => perform(async () => {
      await runtime.saveFinishedBreastfeedingTimer();
      return { status: 'idle' };
    }, true),
    dismissSaved() {
      if (state.status === 'saved') {
        emit({ status: 'idle' });
      }
    },
    tick() {
      if (state.status !== 'session' || state.runtimeState.session.status !== 'running') {
        return;
      }
      const projected = projectBreastfeedingDuration(state.runtimeState.session, now());
      emit({
        ...state,
        projected,
        issue: projected.clockMovedBackward ? 'clock' : state.issue,
      });
    },
  };
}

export type BreastfeedingTimerController = ReturnType<
  typeof createBreastfeedingTimerController
>;
