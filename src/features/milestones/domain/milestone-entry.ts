import {
  createCalendarDate,
  type CalendarDate,
} from '../../children/domain/calendar-date';
import {
  isMilestoneDefinitionId,
  type MilestoneDefinitionId,
} from './milestone-catalog';

export const MILESTONE_CUSTOM_TITLE_MAX_LENGTH = 80;
export const MILESTONE_NOTE_MAX_LENGTH = 500;

export type MilestoneSubject =
  | Readonly<{ kind: 'predefined'; definitionId: MilestoneDefinitionId }>
  | Readonly<{ kind: 'custom'; title: string }>;

export type MilestoneEntry = Readonly<{
  id: string;
  childId: string;
  subject: MilestoneSubject;
  occurredOn: CalendarDate;
  note: string | null;
  revision: number;
}>;

export type MilestoneValidationErrorCode =
  | 'invalid-identity'
  | 'invalid-subject'
  | 'unknown-definition'
  | 'invalid-custom-title'
  | 'invalid-note'
  | 'invalid-occurrence-date'
  | 'invalid-revision';

export class MilestoneValidationError extends Error {
  constructor(readonly code: MilestoneValidationErrorCode) {
    super('The milestone entry is invalid.');
    this.name = 'MilestoneValidationError';
  }
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

function createMilestoneSubject(input: MilestoneSubject): MilestoneSubject {
  if (input === null || typeof input !== 'object' || !('kind' in input)) {
    throw new MilestoneValidationError('invalid-subject');
  }

  if (input.kind === 'predefined') {
    if (!('definitionId' in input) || typeof input.definitionId !== 'string' || 'title' in input) {
      throw new MilestoneValidationError('invalid-subject');
    }
    if (!isMilestoneDefinitionId(input.definitionId)) {
      throw new MilestoneValidationError('unknown-definition');
    }
    return Object.freeze({ kind: 'predefined', definitionId: input.definitionId });
  }

  if (input.kind === 'custom') {
    if (!('title' in input) || typeof input.title !== 'string' || 'definitionId' in input) {
      throw new MilestoneValidationError('invalid-subject');
    }
    const title = input.title.trim();
    if (title.length === 0 || characterLength(title) > MILESTONE_CUSTOM_TITLE_MAX_LENGTH) {
      throw new MilestoneValidationError('invalid-custom-title');
    }
    return Object.freeze({ kind: 'custom', title });
  }

  throw new MilestoneValidationError('invalid-subject');
}

function normalizeNote(input: string | null): string | null {
  if (input === null) return null;
  if (typeof input !== 'string') throw new MilestoneValidationError('invalid-note');
  const note = input.trim();
  if (note.length === 0) return null;
  if (characterLength(note) > MILESTONE_NOTE_MAX_LENGTH) {
    throw new MilestoneValidationError('invalid-note');
  }
  return note;
}

export function createMilestoneEntry(input: MilestoneEntry): MilestoneEntry {
  if (
    typeof input.id !== 'string' || input.id.trim().length === 0 ||
    typeof input.childId !== 'string' || input.childId.trim().length === 0
  ) {
    throw new MilestoneValidationError('invalid-identity');
  }

  const subject = createMilestoneSubject(input.subject);
  let occurredOn: CalendarDate;
  try {
    if (typeof input.occurredOn !== 'string') throw new Error('Invalid date type.');
    occurredOn = createCalendarDate(input.occurredOn);
  } catch {
    throw new MilestoneValidationError('invalid-occurrence-date');
  }

  const note = normalizeNote(input.note);
  if (!Number.isSafeInteger(input.revision) || input.revision <= 0) {
    throw new MilestoneValidationError('invalid-revision');
  }

  return Object.freeze({
    id: input.id,
    childId: input.childId,
    subject,
    occurredOn,
    note,
    revision: input.revision,
  });
}

