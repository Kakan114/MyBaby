import type {
  FeedingHistoryRuntimeResult,
  FeedingRuntime,
} from '@/runtime/app-runtime';

export type FeedingHistoryPresentationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'empty'; childId: string }>
  | Readonly<{ status: 'ready'; result: FeedingHistoryRuntimeResult }>
  | Readonly<{ status: 'error' }>;

type HistoryRuntime = Pick<FeedingRuntime, 'getRecentFeedings'>;
type StateListener = (state: FeedingHistoryPresentationState) => void;

export function createFeedingHistoryController(runtime: HistoryRuntime) {
  let state: FeedingHistoryPresentationState = { status: 'loading' };
  let listener: StateListener | null = null;
  let requestId = 0;

  function emit(next: FeedingHistoryPresentationState) {
    state = next;
    listener?.(next);
  }

  async function refresh(): Promise<void> {
    const currentRequest = ++requestId;
    emit({ status: 'loading' });

    try {
      const result = await runtime.getRecentFeedings();
      if (listener === null || requestId !== currentRequest) return;
      emit(result.events.length === 0
        ? { status: 'empty', childId: result.childId }
        : { status: 'ready', result });
    } catch {
      if (listener !== null && requestId === currentRequest) {
        emit({ status: 'error' });
      }
    }
  }

  return {
    get state() { return state; },
    mount(nextListener: StateListener) { listener = nextListener; },
    unmount() { listener = null; requestId += 1; },
    refresh,
  };
}

export type FeedingHistoryController = ReturnType<typeof createFeedingHistoryController>;
