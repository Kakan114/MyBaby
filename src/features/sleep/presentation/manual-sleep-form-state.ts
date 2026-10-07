import type { CivilDate, CivilDateTime, CivilTime } from './manual-sleep-date-time';

export type ManualSleepEndpoint = 'start' | 'end';
export type ManualSleepOccurrence = 0 | 1 | null;
export type ManualSleepFormMode =
  | 'closed'
  | 'editing'
  | 'saving'
  | 'success'
  | 'uncertain';

export type ManualSleepDraft = Readonly<{
  startDate: CivilDate | null;
  startTime: CivilTime | null;
  endDate: CivilDate | null;
  endTime: CivilTime | null;
  startOccurrence: ManualSleepOccurrence;
  endOccurrence: ManualSleepOccurrence;
}>;

export function createEmptyManualSleepDraft(): ManualSleepDraft {
  return {
    startDate: null,
    startTime: null,
    endDate: null,
    endTime: null,
    startOccurrence: null,
    endOccurrence: null,
  };
}

export function commitManualSleepDate(
  draft: ManualSleepDraft,
  endpoint: ManualSleepEndpoint,
  date: CivilDate,
): ManualSleepDraft {
  return endpoint === 'start'
    ? { ...draft, startDate: date, startOccurrence: null }
    : { ...draft, endDate: date, endOccurrence: null };
}

export function commitManualSleepTime(
  draft: ManualSleepDraft,
  endpoint: ManualSleepEndpoint,
  time: CivilTime,
): ManualSleepDraft {
  return endpoint === 'start'
    ? { ...draft, startTime: time, startOccurrence: null }
    : { ...draft, endTime: time, endOccurrence: null };
}

export type ManualSleepPickerCommitResult =
  | Readonly<{ status: 'accepted'; draft: ManualSleepDraft }>
  | Readonly<{ status: 'future'; draft: ManualSleepDraft }>;

export const MANUAL_SLEEP_FUTURE_PICKER_ERROR_KEY =
  'sleep.manual.errors.future' as const;

export function manualSleepPickerErrorKey(
  result: ManualSleepPickerCommitResult,
): typeof MANUAL_SLEEP_FUTURE_PICKER_ERROR_KEY | null {
  return result.status === 'future'
    ? MANUAL_SLEEP_FUTURE_PICKER_ERROR_KEY
    : null;
}

export function clearManualSleepPickerError(): null {
  return null;
}

export function manualSleepPickerMaximumDate(
  field: 'date' | 'time',
  platform: 'ios' | 'android' | 'other',
  openedAt: Date,
): Date | undefined {
  if (field === 'time') {
    return platform === 'ios' ? new Date(openedAt) : undefined;
  }
  const localToday = new Date(openedAt);
  localToday.setHours(12, 0, 0, 0);
  return localToday;
}

function compareDate(left: CivilDate, right: CivilDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function compareTime(left: CivilTime, right: CivilTime): number {
  return left.hour - right.hour || left.minute - right.minute;
}

function endpointTime(
  draft: ManualSleepDraft,
  endpoint: ManualSleepEndpoint,
): CivilTime | null {
  return endpoint === 'start' ? draft.startTime : draft.endTime;
}

function endpointDate(
  draft: ManualSleepDraft,
  endpoint: ManualSleepEndpoint,
): CivilDate | null {
  return endpoint === 'start' ? draft.startDate : draft.endDate;
}

export function confirmManualSleepDate(
  draft: ManualSleepDraft,
  endpoint: ManualSleepEndpoint,
  date: CivilDate,
  now: CivilDateTime,
): ManualSleepPickerCommitResult {
  const dateComparison = compareDate(date, now);
  const existingTime = endpointTime(draft, endpoint);
  if (
    dateComparison > 0 ||
    (dateComparison === 0 && existingTime !== null && compareTime(existingTime, now) > 0)
  ) {
    return { status: 'future', draft };
  }
  return { status: 'accepted', draft: commitManualSleepDate(draft, endpoint, date) };
}

export function confirmManualSleepTime(
  draft: ManualSleepDraft,
  endpoint: ManualSleepEndpoint,
  time: CivilTime,
  now: CivilDateTime,
): ManualSleepPickerCommitResult {
  const date = endpointDate(draft, endpoint);
  if (date !== null && compareDate(date, now) === 0 && compareTime(time, now) > 0) {
    return { status: 'future', draft };
  }
  return { status: 'accepted', draft: commitManualSleepTime(draft, endpoint, time) };
}

export function manualSleepBlurAction(
  mode: ManualSleepFormMode,
): 'reset' | 'lock-uncertain' | 'preserve' {
  if (mode === 'success') return 'reset';
  if (mode === 'saving') return 'lock-uncertain';
  return 'preserve';
}
