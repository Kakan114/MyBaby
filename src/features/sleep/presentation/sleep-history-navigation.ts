export const sleepHistoryRoute = '/sleep-history' as const;

export function openSleepHistory(
  navigate: (route: typeof sleepHistoryRoute) => void,
): void {
  navigate(sleepHistoryRoute);
}
