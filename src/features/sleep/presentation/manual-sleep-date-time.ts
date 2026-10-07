import {
  assertCivilDate,
  chooseLocalCivilInstant,
  type CivilDate,
  type CivilDateTime,
  type CivilTime,
} from '../../../utils/local-civil-date-time';

export {
  civilDateFromAndroidDatePicker,
  civilDateFromLocalPicker,
  civilTimeFromLocalPicker,
  createAndroidDatePickerValue,
  createLocalPickerValue,
  resolveLocalCivilDateTime,
  type CivilDate,
  type CivilDateTime,
  type CivilTime,
  type LocalCivilResolution,
} from '../../../utils/local-civil-date-time';

export type ManualSleepIntervalResolution =
  | Readonly<{ status: 'valid'; startedAtEpochMs: number; endedAtEpochMs: number }>
  | Readonly<{ status: 'nonexistent' | 'ambiguous' | 'invalid-range' }>;

export function resolveManualSleepInterval(
  start: CivilDateTime,
  end: CivilDateTime,
  startOccurrence: 0 | 1 | null = null,
  endOccurrence: 0 | 1 | null = null,
): ManualSleepIntervalResolution {
  const resolvedStart = chooseLocalCivilInstant(start, startOccurrence);
  const resolvedEnd = chooseLocalCivilInstant(end, endOccurrence);
  if (resolvedStart.status === 'nonexistent' || resolvedEnd.status === 'nonexistent') {
    return { status: 'nonexistent' };
  }
  if (resolvedStart.status === 'ambiguous' || resolvedEnd.status === 'ambiguous') {
    return { status: 'ambiguous' };
  }
  if (resolvedEnd.epochMs <= resolvedStart.epochMs) {
    return { status: 'invalid-range' };
  }
  return {
    status: 'valid',
    startedAtEpochMs: resolvedStart.epochMs,
    endedAtEpochMs: resolvedEnd.epochMs,
  };
}

export function formatCivilDate(value: CivilDate): string {
  assertCivilDate(value);
  const months = [
    'jan.', 'feb.', 'mars', 'apr.', 'maj', 'juni',
    'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.',
  ] as const;
  return `${value.day} ${months[value.month - 1]} ${value.year}`;
}

export function formatCivilTime(value: CivilTime): string {
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
}
