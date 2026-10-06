import type { BreastfeedingTimerSession } from '../domain/breastfeeding-timer';

export type TimerDiscardCopyVariant = 'active' | 'finished';

export function getTimerDiscardCopyVariant(
  status: BreastfeedingTimerSession['status'],
): TimerDiscardCopyVariant {
  return status === 'finished' ? 'finished' : 'active';
}

export type TimerDiscardConfirmationCopy = Readonly<{
  title: string;
  message: string;
  continueLabel: string;
  discardLabel: string;
}>;

export type TimerDiscardDialogButton = Readonly<{
  text: string;
  style: 'cancel' | 'destructive';
  onPress?: () => void;
}>;

export type ShowTimerDiscardDialog = (
  title: string,
  message: string,
  buttons: readonly TimerDiscardDialogButton[],
) => void;

export function requestTimerDiscardConfirmation(
  showDialog: ShowTimerDiscardDialog,
  copy: TimerDiscardConfirmationCopy,
  discard: () => void,
): void {
  showDialog(copy.title, copy.message, [
    { text: copy.continueLabel, style: 'cancel' },
    { text: copy.discardLabel, style: 'destructive', onPress: discard },
  ]);
}
