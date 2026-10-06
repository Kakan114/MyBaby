import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useChildrenRuntime } from '@/runtime/app-runtime-provider';

import type { ActiveChildSummary } from '../application/get-active-child-summary';

export type ActiveChildState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; summary: ActiveChildSummary }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'error' }>;

export function useActiveChild() {
  const runtime = useChildrenRuntime();
  const [state, setState] = useState<ActiveChildState>({ status: 'loading' });
  const focusedRef = useRef(false);
  const requestIdRef = useRef(0);
  const pendingRef = useRef(false);

  const load = useCallback(async (mode: 'foreground' | 'refresh' | 'periodic' = 'foreground') => {
    if (!focusedRef.current || (mode === 'periodic' && pendingRef.current)) {
      return;
    }

    const requestId = ++requestIdRef.current;
    pendingRef.current = true;
    if (mode !== 'periodic') {
      setState((current) =>
        mode === 'refresh' && current.status === 'ready'
          ? current
          : { status: 'loading' },
      );
    }

    try {
      const summary = await runtime.getActiveChildSummary();
      if (focusedRef.current && requestIdRef.current === requestId) {
        setState(summary === null
          ? { status: 'missing' }
          : { status: 'ready', summary });
      }
    } catch {
      if (focusedRef.current && requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    } finally {
      if (requestIdRef.current === requestId) {
        pendingRef.current = false;
      }
    }
  }, [runtime]);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void load('refresh');

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void load('refresh');
      } else {
        // Invalidate any read started before the app entered the background.
        requestIdRef.current += 1;
        pendingRef.current = false;
      }
    });
    // Re-read using the runtime clock while Today stays open across midnight.
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        void load('periodic');
      }
    }, 60_000);

    return () => {
      focusedRef.current = false;
      requestIdRef.current += 1;
      pendingRef.current = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, [load]));

  const retry = useCallback(() => load(), [load]);
  return { state, retry };
}
