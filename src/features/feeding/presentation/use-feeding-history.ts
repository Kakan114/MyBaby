import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useFeedingRuntime } from '@/runtime/app-runtime-provider';

import {
  createFeedingHistoryController,
  type FeedingHistoryPresentationState,
} from './feeding-history-controller';

export function useFeedingHistory() {
  const runtime = useFeedingRuntime();
  const controller = useMemo(
    () => createFeedingHistoryController(runtime),
    [runtime],
  );
  const [state, setState] = useState<FeedingHistoryPresentationState>(
    controller.state,
  );

  useFocusEffect(useCallback(() => {
    controller.mount(setState);
    void controller.refresh();
    return () => {
      controller.unmount();
      // A retained route must not show the previous child's rows on next focus.
      setState({ status: 'loading' });
    };
  }, [controller]));

  return { state, retry: controller.refresh };
}
