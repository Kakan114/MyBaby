import { useCallback, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useDiaperRuntime } from '@/runtime/app-runtime-provider';
import { createDiaperController, type DiaperPresentationState } from './diaper-controller';

export function useDiapers() {
  const runtime = useDiaperRuntime();
  const controller = useMemo(() => createDiaperController(runtime), [runtime]);
  const [state, setState] = useState<DiaperPresentationState>(controller.state);
  useFocusEffect(useCallback(() => {
    controller.mount(setState);
    void controller.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.refresh();
    });
    return () => {
      subscription.remove();
      controller.unmount();
      setState({ status: 'loading' });
    };
  }, [controller]));
  return { state, controller };
}
