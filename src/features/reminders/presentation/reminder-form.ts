import {
  assertCivilDate,
  assertCivilTime,
  chooseLocalCivilInstant,
  civilDateFromLocalPicker,
  civilTimeFromLocalPicker,
  resolveLocalCivilDateTime,
  type CivilDate,
  type CivilTime,
} from '../../../utils/local-civil-date-time';
import type { ReminderValues } from '../application/reminder';
import { REMINDER_TITLE_MAX_LENGTH, type Reminder } from '../domain/reminder';

export type ReminderDraft = Readonly<{
  title: string;
  date: CivilDate | null;
  time: CivilTime | null;
  occurrence: 0 | 1 | null;
}>;

export type ReminderFieldErrors = Partial<Record<'title' | 'date' | 'time',
  'required' | 'tooLong' | 'invalid' | 'nonexistent' | 'ambiguous' | 'notFuture'>>;

export const emptyReminderDraft: ReminderDraft = Object.freeze({
  title: '', date: null, time: null, occurrence: null,
});

export function reminderDraftFromReminder(reminder: Reminder): ReminderDraft {
  const value = new Date(reminder.scheduledAtEpochMs);
  const date = civilDateFromLocalPicker(value);
  const time = civilTimeFromLocalPicker(value);
  const resolution = resolveLocalCivilDateTime({ ...date, ...time });
  const occurrence = resolution.status === 'ambiguous'
    ? resolution.epochMs[0] === reminder.scheduledAtEpochMs ? 0 : 1
    : null;
  return Object.freeze({ title: reminder.title, date, time, occurrence });
}

export function parseReminderDraft(
  draft: ReminderDraft,
  nowEpochMs: number,
): Readonly<{ values: ReminderValues | null; errors: ReminderFieldErrors }> {
  const errors: ReminderFieldErrors = {};
  const title = draft.title.trim();
  if (title.length === 0) errors.title = 'required';
  else if (Array.from(title).length > REMINDER_TITLE_MAX_LENGTH) errors.title = 'tooLong';
  if (draft.date === null) errors.date = 'required';
  if (draft.time === null) errors.time = 'required';
  if (Object.keys(errors).length !== 0 || draft.date === null || draft.time === null) {
    return { values: null, errors };
  }
  try { assertCivilDate(draft.date); }
  catch { return { values: null, errors: { ...errors, date: 'invalid' } }; }
  try { assertCivilTime(draft.time); }
  catch { return { values: null, errors: { ...errors, time: 'invalid' } }; }
  let chosen;
  chosen = chooseLocalCivilInstant({ ...draft.date, ...draft.time }, draft.occurrence);
  if (chosen.status === 'nonexistent') return { values: null, errors: { ...errors, time: 'nonexistent' } };
  if (chosen.status === 'ambiguous') return { values: null, errors: { ...errors, time: 'ambiguous' } };
  if (chosen.epochMs <= nowEpochMs) return { values: null, errors: { ...errors, time: 'notFuture' } };
  return { values: { title, scheduledAtEpochMs: chosen.epochMs }, errors };
}

export function reminderDraftResolution(draft: ReminderDraft) {
  return draft.date === null || draft.time === null
    ? null
    : resolveLocalCivilDateTime({ ...draft.date, ...draft.time });
}
