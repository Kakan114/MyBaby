import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useReminderRuntime } from '../../../runtime/app-runtime-provider';
import { createReminderController, type ReminderController, type ReminderState } from './reminder-controller';

const Context = createContext<Readonly<{ controller: ReminderController; state: ReminderState }> | null>(null);

/** Owns transient forms and unresolved attempts across both Reminder routes; SQLite remains canonical. */
export function ReminderPresentationProvider({ children }: PropsWithChildren) {
  const { reminders, notifications, selection } = useReminderRuntime();
  const controller = useMemo(
    () => createReminderController(reminders, notifications, selection),
    [reminders, notifications, selection],
  );
  const [state, setState] = useState(controller.state);
  useEffect(() => {
    controller.connect();
    const unsubscribe = controller.subscribe(setState);
    return () => { unsubscribe(); controller.dispose(); };
  }, [controller]);
  return <Context.Provider value={{ controller, state }}>{children}</Context.Provider>;
}

export function useReminders() {
  const value = useContext(Context);
  if (value === null) throw new Error('Reminder presentation provider is required.');
  const { controller } = value;
  useFocusEffect(useCallback(() => {
    const leave = controller.focus();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.refresh();
    });
    return () => { subscription.remove(); leave(); };
  }, [controller]));
  return value;
}
