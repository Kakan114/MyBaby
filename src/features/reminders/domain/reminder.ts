export const REMINDER_TITLE_MAX_LENGTH = 100;
export const MAX_REMINDER_EPOCH_MS = 8_640_000_000_000_000;

export type Reminder = Readonly<{
  id: string;
  childId: string;
  title: string;
  scheduledAtEpochMs: number;
  revision: number;
}>;

export type ReminderValidationErrorCode =
  | 'invalid-identity'
  | 'invalid-title'
  | 'invalid-scheduled-instant'
  | 'invalid-revision';

export class ReminderValidationError extends Error {
  constructor(readonly code: ReminderValidationErrorCode) {
    super('The reminder is invalid.');
    this.name = 'ReminderValidationError';
  }
}

function characterLength(value: string): number {
  return Array.from(value).length;
}

/** Active-child ownership and future-time eligibility belong to application operations. */
export function createReminder(input: Reminder): Reminder {
  if (
    typeof input.id !== 'string' || input.id.trim().length === 0 ||
    typeof input.childId !== 'string' || input.childId.trim().length === 0
  ) {
    throw new ReminderValidationError('invalid-identity');
  }

  if (typeof input.title !== 'string') {
    throw new ReminderValidationError('invalid-title');
  }
  const title = input.title.trim();
  if (title.length === 0 || characterLength(title) > REMINDER_TITLE_MAX_LENGTH) {
    throw new ReminderValidationError('invalid-title');
  }

  if (
    !Number.isSafeInteger(input.scheduledAtEpochMs) ||
    input.scheduledAtEpochMs < -MAX_REMINDER_EPOCH_MS ||
    input.scheduledAtEpochMs > MAX_REMINDER_EPOCH_MS ||
    Number.isNaN(new Date(input.scheduledAtEpochMs).getTime())
  ) {
    throw new ReminderValidationError('invalid-scheduled-instant');
  }

  if (!Number.isSafeInteger(input.revision) || input.revision <= 0) {
    throw new ReminderValidationError('invalid-revision');
  }

  return Object.freeze({
    id: input.id,
    childId: input.childId,
    title,
    scheduledAtEpochMs: input.scheduledAtEpochMs,
    revision: input.revision,
  });
}
