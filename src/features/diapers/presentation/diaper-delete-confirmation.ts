export type DiaperDeleteConfirmationAction = Readonly<{
  text: string;
  style: 'cancel' | 'destructive';
  onPress?: () => void;
}>;

export function createDiaperDeleteConfirmationActions(
  labels: Readonly<{ cancel: string; confirm: string }>,
  onConfirm: () => void,
): DiaperDeleteConfirmationAction[] {
  return [
    { text: labels.cancel, style: 'cancel' },
    { text: labels.confirm, style: 'destructive', onPress: onConfirm },
  ];
}
