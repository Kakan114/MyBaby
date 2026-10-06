import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useFeedingRuntime } from '@/runtime/app-runtime-provider';

import type { BreastSide } from '../domain/breastfeeding-timer';
import {
  createBreastfeedingTimerController,
  type BreastfeedingTimerPresentationState,
} from './breastfeeding-timer-controller';

type TimerContextValue = Readonly<{
  state: BreastfeedingTimerPresentationState;
  refresh(): Promise<void>;
  start(side: BreastSide): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  switchSide(): Promise<void>;
  finish(): Promise<void>;
  discard(): Promise<void>;
  save(): Promise<void>;
  dismissSaved(): void;
}>;

const TimerContext = createContext<TimerContextValue | null>(null);

export function BreastfeedingTimerProvider({ children }: PropsWithChildren) {
  const runtime = useFeedingRuntime();
  const controller = useMemo(
    () => createBreastfeedingTimerController(runtime),
    [runtime],
  );
  const [state, setState] = useState<BreastfeedingTimerPresentationState>(
    controller.state,
  );

  useEffect(() => {
    controller.mount(setState);
    void controller.refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.refresh();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') controller.tick();
    }, 1_000);
    return () => {
      controller.unmount();
      subscription.remove();
      clearInterval(interval);
    };
  }, [controller]);

  const value = useMemo<TimerContextValue>(() => ({
    state,
    refresh: controller.refresh,
    start: controller.start,
    pause: controller.pause,
    resume: controller.resume,
    switchSide: controller.switchSide,
    finish: controller.finish,
    discard: controller.discard,
    save: controller.save,
    dismissSaved: controller.dismissSaved,
  }), [controller, state]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useBreastfeedingTimer(): TimerContextValue {
  const value = useContext(TimerContext);
  if (value === null) {
    throw new Error('useBreastfeedingTimer must be used within its provider.');
  }
  return value;
}
