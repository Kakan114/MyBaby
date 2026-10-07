export const diaperHistoryRoute = '/diaper-history' as const;

export function openDiaperHistory(
  clearTransientFeedback: () => void,
  navigate: (route: typeof diaperHistoryRoute) => void,
): void {
  clearTransientFeedback();
  navigate(diaperHistoryRoute);
}
