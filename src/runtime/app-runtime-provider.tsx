// @refresh reset

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from 'react';

import type { ChildrenRuntime } from './app-runtime';
import { createProductionAppRuntime } from './create-production-app-runtime';

const ChildrenRuntimeContext = createContext<ChildrenRuntime | null>(null);

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
      {children}
    </ChildrenRuntimeContext.Provider>
  );
}

export function useChildrenRuntime(): ChildrenRuntime {
  const runtime = useContext(ChildrenRuntimeContext);

  if (runtime === null) {
    throw new Error('useChildrenRuntime must be used within AppRuntimeProvider.');
  }

  return runtime;
}
