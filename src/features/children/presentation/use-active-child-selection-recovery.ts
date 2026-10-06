import { useCallback, useEffect, useRef, useState } from 'react';

import { useChildrenRuntime } from '@/runtime/app-runtime-provider';

import type { Child } from '../domain/child';

export type ActiveChildSelectionRecoveryState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'ready'; children: readonly Child[] }>
  | Readonly<{ status: 'empty' }>
  | Readonly<{
      status: 'selecting';
      children: readonly Child[];
      selectedChildId: string;
    }>
  | Readonly<{ status: 'error' }>
  | Readonly<{ status: 'uncertain' }>
  | Readonly<{ status: 'checking' }>;

export function useActiveChildSelectionRecovery(
  refreshBootstrap: () => Promise<void>,
) {
  const runtime = useChildrenRuntime();
  const [state, setState] = useState<ActiveChildSelectionRecoveryState>({
    status: 'loading',
  });
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const childrenRef = useRef<readonly Child[]>([]);
  const selectionLockedRef = useRef(false);
  const recoveryLockedRef = useRef(false);

  const loadChildren = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (mountedRef.current) {
      setState({ status: 'loading' });
    }

    try {
      const children = await runtime.listChildren();

      if (mountedRef.current && requestIdRef.current === requestId) {
        childrenRef.current = children;
        setState(
          children.length === 0
            ? { status: 'empty' }
            : { status: 'ready', children },
        );
      }
    } catch {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setState({ status: 'error' });
      }
    }
  }, [runtime]);

  useEffect(() => {
    mountedRef.current = true;
    void loadChildren();

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [loadChildren]);

  const selectChild = useCallback(
    async (id: string) => {
      if (selectionLockedRef.current || !mountedRef.current) {
        return;
      }

      selectionLockedRef.current = true;
      setState({
        status: 'selecting',
        children: childrenRef.current,
        selectedChildId: id,
      });

      try {
        await runtime.setActiveChild(id);
      } catch {
        if (mountedRef.current) {
          setState({ status: 'uncertain' });
        }
        return;
      }

      if (!mountedRef.current) {
        return;
      }

      try {
        await refreshBootstrap();
      } catch {
        if (mountedRef.current) {
          setState({ status: 'uncertain' });
        }
      }
    },
    [refreshBootstrap, runtime],
  );

  const recheckBootstrap = useCallback(async () => {
    if (recoveryLockedRef.current || !mountedRef.current) {
      return;
    }

    recoveryLockedRef.current = true;
    setState({ status: 'checking' });

    try {
      await refreshBootstrap();
    } catch {
      // The persisted selection remains unknown; only another bootstrap read is safe.
    } finally {
      if (mountedRef.current) {
        recoveryLockedRef.current = false;
        setState({ status: 'uncertain' });
      }
    }
  }, [refreshBootstrap]);

  return {
    loadChildren,
    recheckBootstrap,
    selectChild,
    state,
  };
}
