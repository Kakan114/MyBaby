import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';
import type { MilestoneValues } from '../application/milestone';
import {
  MILESTONE_CUSTOM_TITLE_MAX_LENGTH,
  MILESTONE_NOTE_MAX_LENGTH,
  MilestoneValidationError,
  createMilestoneEntry,
  type MilestoneEntry,
} from '../domain/milestone-entry';
import { isMilestoneDefinitionId, type MilestoneDefinitionId } from '../domain/milestone-catalog';

export type MilestoneSelection = MilestoneDefinitionId | 'custom' | null;
export type MilestoneDraft = Readonly<{
  selection: MilestoneSelection;
  customTitle: string;
  occurredOn: CalendarDate | null;
  note: string;
}>;
export type MilestoneField = 'subject' | 'customTitle' | 'occurredOn' | 'note';
export type MilestoneFieldErrors = Partial<Record<MilestoneField, string>>;

export const emptyMilestoneDraft: MilestoneDraft = Object.freeze({
  selection: null,
  customTitle: '',
  occurredOn: null,
  note: '',
});

export function milestoneDraftFromEntry(entry: MilestoneEntry): MilestoneDraft {
  return Object.freeze({
    selection: entry.subject.kind === 'predefined' ? entry.subject.definitionId : 'custom',
    customTitle: entry.subject.kind === 'custom' ? entry.subject.title : '',
    occurredOn: entry.occurredOn,
    note: entry.note ?? '',
  });
}

export function parseMilestoneDraft(draft: MilestoneDraft): {
  values: MilestoneValues | null;
  errors: MilestoneFieldErrors;
} {
  const errors: MilestoneFieldErrors = {};
  if (draft.selection === null || (draft.selection !== 'custom' && !isMilestoneDefinitionId(draft.selection))) {
    errors.subject = 'subject';
  }
  if (draft.selection === 'custom') {
    const length = Array.from(draft.customTitle.trim()).length;
    if (length === 0 || length > MILESTONE_CUSTOM_TITLE_MAX_LENGTH) errors.customTitle = 'customTitle';
  }
  let occurredOn: CalendarDate | null = null;
  try {
    if (draft.occurredOn === null) throw new Error('Missing date.');
    occurredOn = createCalendarDate(draft.occurredOn);
  } catch { errors.occurredOn = 'date'; }
  if (Array.from(draft.note.trim()).length > MILESTONE_NOTE_MAX_LENGTH) errors.note = 'note';
  if (Object.keys(errors).length !== 0 || occurredOn === null || draft.selection === null) {
    return { values: null, errors };
  }
  const values: MilestoneValues = {
    subject: draft.selection === 'custom'
      ? { kind: 'custom', title: draft.customTitle }
      : { kind: 'predefined', definitionId: draft.selection },
    occurredOn,
    note: draft.note,
  };
  // Reuse domain normalization and length validation without introducing presentation-only rules.
  try {
    const normalized = createMilestoneEntry({ id: 'draft', childId: 'draft', ...values, revision: 1 });
    return { errors, values: { subject: normalized.subject, occurredOn: normalized.occurredOn, note: normalized.note } };
  } catch (error) {
    if (error instanceof MilestoneValidationError) {
      if (error.code === 'invalid-custom-title') errors.customTitle = 'customTitle';
      else if (error.code === 'invalid-note') errors.note = 'note';
      else errors.subject = 'subject';
    }
    return { values: null, errors };
  }
}
