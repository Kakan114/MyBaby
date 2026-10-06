// @refresh reset

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { ChildrenRuntime, FeedingRuntime } from './app-runtime';
import { createProductionAppRuntime } from './create-production-app-runtime';

const ChildrenRuntimeContext = createContext<ChildrenRuntime | null>(null);
const FeedingRuntimeContext = createContext<FeedingRuntime | null>(null);

export function AppRuntimeProvider({ children }: PropsWithChildren) {
  const [runtime] = useState(createProductionAppRuntime);

  useEffect(
    () => () => {
      void runtime.close().catch(() => undefined);
    },
    [runtime],
  );

  return (
    <ChildrenRuntimeContext.Provider value={runtime.children}>
      <FeedingRuntimeContext.Provider value={runtime.feeding}>
        {children}
      </FeedingRuntimeContext.Provider>
    </ChildrenRuntimeContext.Provider>
  );
}

export function useFeedingRuntime(): FeedingRuntime {
  const runtime = useContext(FeedingRuntimeContext);

  if (runtime === null) {
    throw new Error('useFeedingRuntime must be used within AppRuntimeProvider.');
  }

  return runtime;
}

export function useChildrenRuntime(): ChildrenRuntime {
  const runtime = useContext(ChildrenRuntimeContext);

  if (runtime === null) {
    throw new Error('useChildrenRuntime must be used within AppRuntimeProvider.');
  }

  return runtime;
}
