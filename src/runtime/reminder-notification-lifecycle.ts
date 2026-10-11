import type { ReminderNotificationsRuntime } from './app-runtime';

export type RuntimeAppState = Readonly<{
  currentState: string;
  addEventListener(
    event: 'change',
    listener: (state: string) => void,
  ): Readonly<{ remove(): void }>;
}>;

/** One root-owned listener; reconciliation failures never affect unrelated app features. */
export function startReminderNotificationLifecycle(
  runtime: ReminderNotificationsRuntime,
  appState: RuntimeAppState,
): () => void {
  let disposed = false;
  let previousState = appState.currentState;
  const reconcile = () => {
    if (!disposed) void runtime.reconcile().catch(() => undefined);
  };

  reconcile();
  const subscription = appState.addEventListener('change', (nextState) => {
    const returnedToForeground = nextState === 'active' && previousState !== 'active';
    previousState = nextState;
    if (returnedToForeground) reconcile();
  });

  return () => {
    disposed = true;
    subscription.remove();
  };
}
