import { useCallback, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useSleepRuntime } from '@/runtime/app-runtime-provider';

import { createSleepController, type SleepPresentationState } from './sleep-controller';

export function useSleep() {
  const runtime = useSleepRuntime();
  const controller = useMemo(() => createSleepController(runtime), [runtime]);
  const [state, setState] = useState<SleepPresentationState>(controller.state);

  useFocusEffect(useCallback(() => {
    controller.mount(setState);
    void controller.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.refresh(false);
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

  return { state, controller };
}
