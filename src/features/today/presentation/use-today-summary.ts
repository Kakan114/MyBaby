import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useTodayRuntime } from '@/runtime/app-runtime-provider';
import { createTodayController, type TodayState } from './today-controller';
import { localContextKey, millisecondsUntilLocalMidnight } from './today-format';

export function useTodaySummary() {
  const runtime = useTodayRuntime();
  const [state, setState] = useState<TodayState>({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef<TodayState>(state);
  const controller = useMemo(() => createTodayController(runtime, next => {
    latest.current = next;
    setState(next);
  }), [runtime]);
  useEffect(() => runtime.subscribeSelectionChange?.(
    switching => controller.selectionChanged(switching),
  ), [controller, runtime]);
  useFocusEffect(useCallback(() => {
    const current = controller;
    let foreground = AppState.currentState === 'active';
    let context = localContextKey(Date.now());
    let midnight: ReturnType<typeof setTimeout> | undefined;
    function scheduleMidnight() {
      clearTimeout(midnight);
      if (!foreground) return;
      const timestamp = Date.now();
      midnight = setTimeout(() => {
        checkContext();
        scheduleMidnight();
      }, millisecondsUntilLocalMidnight(timestamp));
    }
    function checkContext() {
      if (!foreground) return;
      const timestamp = Date.now();
      const nextContext = localContextKey(timestamp);
      if (context !== nextContext) {
        context = nextContext;
        setNow(timestamp);
        void current.refresh();
        scheduleMidnight();
      }
    }
    if (foreground) {
      setNow(Date.now());
      current.activate();
      scheduleMidnight();
    }
    const subscription = AppState.addEventListener('change', next => {
      foreground = next === 'active';
      clearTimeout(midnight);
      if (foreground) {
        context = localContextKey(Date.now());
        setNow(Date.now());
        current.activate();
        scheduleMidnight();
      } else current.deactivate();
    });
    // Check timezone/clock changes locally; no periodic database polling.
    const calendarTimer = setInterval(checkContext, 30_000);
    const displayTimer = setInterval(() => {
      if (foreground && latest.current.status === 'ready' && latest.current.summary.sleep.active) {
        setNow(Date.now());
      }
    }, 1000);
    return () => {
      foreground = false;
      current.deactivate();
      subscription.remove();
      clearTimeout(midnight);
      clearInterval(calendarTimer);
      clearInterval(displayTimer);
    };
  }, [controller]));
  const retry = useCallback(() => controller.refresh(true), [controller]);
  return { state, now, retry };
}
