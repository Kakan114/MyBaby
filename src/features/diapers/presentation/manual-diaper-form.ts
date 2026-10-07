import {
  civilDateFromLocalPicker,
  createAndroidDatePickerValue,
  chooseLocalCivilInstant,
  type CivilDate,
  type CivilDateTime,
  type CivilTime,
} from '../../../utils/local-civil-date-time';
import type { DiaperEvent } from '../domain/diaper-event';

export type ManualDiaperDraft = Readonly<{
  kind: 'wet' | 'dirty' | 'mixed' | null;
  date: CivilDate | null;
  time: CivilTime | null;
  occurrence: 0 | 1 | null;
}>;

export const emptyManualDiaperDraft: ManualDiaperDraft = {
  kind: null, date: null, time: null, occurrence: null,
};

export function manualDiaperDraftFromEvent(event: DiaperEvent): ManualDiaperDraft {
  const date = new Date(event.occurredAtEpochMs);
  const civil = {
    ...civilDateFromLocalPicker(date),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
  const resolution = chooseLocalCivilInstant(civil, null);
  let occurrence: 0 | 1 | null = null;
  if (resolution.status === 'ambiguous') {
    const eventMinute = Math.floor(event.occurredAtEpochMs / 60_000);
    const resolved = chooseLocalCivilInstant(civil, 0);
    occurrence = resolved.status === 'valid' &&
      Math.floor(resolved.epochMs / 60_000) === eventMinute ? 0 : 1;
  }
  return {
    kind: event.kind,
    date: { year: civil.year, month: civil.month, day: civil.day },
    time: { hour: civil.hour, minute: civil.minute },
    occurrence,
  };
}

export function resolveEditedDiaperTimestamp(
  originalEpochMs: number,
  selectedEpochMs: number,
): number {
  return Math.floor(originalEpochMs / 60_000) === Math.floor(selectedEpochMs / 60_000)
    ? originalEpochMs
    : selectedEpochMs;
}

export function diaperPickerMaximumDate(
  field: 'date' | 'time',
  platform: 'ios' | 'android' | 'other',
  openedAt: Date,
): Date | undefined {
  if (field === 'time') return platform === 'ios' ? new Date(openedAt) : undefined;
  return platform === 'android'
    ? createAndroidDatePickerValue(civilDateFromLocalPicker(openedAt))
    : new Date(openedAt);
}

function compareDate(left: CivilDate, right: CivilDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function compareTime(left: CivilTime, right: CivilTime): number {
  return left.hour - right.hour || left.minute - right.minute;
}

export function confirmDiaperDate(
  draft: ManualDiaperDraft, date: CivilDate, now: CivilDateTime,
): Readonly<{ status: 'accepted' | 'future'; draft: ManualDiaperDraft }> {
  const comparison = compareDate(date, now);
  if (comparison > 0 || (comparison === 0 && draft.time !== null && compareTime(draft.time, now) > 0)) {
    return { status: 'future', draft };
  }
  return { status: 'accepted', draft: { ...draft, date, occurrence: null } };
}

export function confirmDiaperTime(
  draft: ManualDiaperDraft, time: CivilTime, now: CivilDateTime,
): Readonly<{ status: 'accepted' | 'future'; draft: ManualDiaperDraft }> {
  if (draft.date !== null && compareDate(draft.date, now) === 0 && compareTime(time, now) > 0) {
    return { status: 'future', draft };
  }
  return { status: 'accepted', draft: { ...draft, time, occurrence: null } };
}

export function resolveManualDiaperInstant(draft: ManualDiaperDraft) {
  if (draft.date === null || draft.time === null) return { status: 'incomplete' } as const;
  return chooseLocalCivilInstant({ ...draft.date, ...draft.time }, draft.occurrence);
}
