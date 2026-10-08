import { createContext, useContext, useEffect, useMemo, useState, useCallback, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useChildrenRuntime, useGrowthRuntime } from '@/runtime/app-runtime-provider';
import { createGrowthController, type GrowthController, type GrowthState } from './growth-controller';

const Context = createContext<Readonly<{ controller: GrowthController; state: GrowthState }> | null>(null);
/** Keeps uncertain attempts across route changes; owns no database or recording logic. */
export function GrowthPresentationProvider({ children }: PropsWithChildren) {
  const { growth, selection } = useGrowthRuntime();
  const childrenRuntime = useChildrenRuntime();
  const controller = useMemo(() => createGrowthController(growth, childrenRuntime, selection), [growth, childrenRuntime, selection]);
  const [state, setState] = useState(controller.state);
  useEffect(() => {
    controller.connect();
    const unsubscribe = controller.subscribe(setState);
    return () => { unsubscribe(); controller.dispose(); };
  }, [controller]);
  return <Context.Provider value={{ controller, state }}>{children}</Context.Provider>;
}
export function useGrowth() {
  const value = useContext(Context);
  if (value === null) throw new Error('Growth presentation provider is required.');
  const { controller } = value;
  useFocusEffect(useCallback(() => {
    const leave = controller.focus();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void controller.refresh(); });
    return () => { subscription.remove(); leave(); };
  }, [controller]));
  return value;
}
