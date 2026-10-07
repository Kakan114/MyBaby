import { useCallback, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useSleepRuntime } from '@/runtime/app-runtime-provider';

import {
  createSleepHubStatusController,
  type SleepHubStatusState,
} from './sleep-hub-status-controller';

export function useSleepHubStatus(): SleepHubStatusState {
  const runtime = useSleepRuntime();
  const controller = useMemo(
    () => createSleepHubStatusController(runtime),
    [runtime],
  );
  const [state, setState] = useState<SleepHubStatusState>(controller.state);

  useFocusEffect(useCallback(() => {
    controller.mount(setState);
    void controller.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.refresh();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') controller.tick();
    }, 1_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
      controller.unmount();
      setState({ status: 'loading' });
    };
  }, [controller]));

  return state;
}
