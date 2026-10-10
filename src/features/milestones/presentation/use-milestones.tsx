import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useChildrenRuntime, useMilestoneRuntime } from '@/runtime/app-runtime-provider';
import { createMilestoneController, type MilestoneController, type MilestoneState } from './milestone-controller';

const Context = createContext<Readonly<{ controller: MilestoneController; state: MilestoneState }> | null>(null);

/** Keeps exact uncertain attempts across the recording and history routes; owns no persistence. */
export function MilestonePresentationProvider({ children }: PropsWithChildren) {
  const { milestones, selection } = useMilestoneRuntime();
  const childrenRuntime = useChildrenRuntime();
  const controller = useMemo(() => createMilestoneController(milestones, childrenRuntime, selection), [milestones, childrenRuntime, selection]);
  const [state, setState] = useState(controller.state);
  useEffect(() => {
    controller.connect();
    const unsubscribe = controller.subscribe(setState);
    return () => { unsubscribe(); controller.dispose(); };
  }, [controller]);
  return <Context.Provider value={{ controller, state }}>{children}</Context.Provider>;
}

export function useMilestones() {
  const value = useContext(Context);
  if (value === null) throw new Error('Milestone presentation provider is required.');
  const { controller } = value;
  useFocusEffect(useCallback(() => {
    const leave = controller.focus();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void controller.refresh(); });
    return () => { subscription.remove(); leave(); };
  }, [controller]));
  return value;
}
