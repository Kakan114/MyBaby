import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

import { useBreastfeedingTimer } from './breastfeeding-timer-provider';

export function FeedingSuccessFocusLifecycle({
  dismissSubmissionSuccess,
}: Readonly<{ dismissSubmissionSuccess(): void }>) {
  const { dismissSaved: dismissTimerSaved } = useBreastfeedingTimer();

  useFocusEffect(useCallback(() => () => {
    dismissSubmissionSuccess();
    dismissTimerSaved();
  }, [dismissSubmissionSuccess, dismissTimerSaved]));

  return null;
}
