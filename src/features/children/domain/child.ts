import {
  compareCalendarDates,
  createCalendarDate,
  type CalendarDate,
} from './calendar-date';

export type Child = Readonly<{
  id: string;
  displayName: string;
  dateOfBirth: CalendarDate;
}>;

export type CreateChildInput = Readonly<{
  id: string;
  displayName: string;
  dateOfBirth: string;
}>;

export type ChildValidationErrorCode =
  | 'invalid-display-name'
  | 'future-date-of-birth';

export class ChildValidationError extends Error {
  constructor(readonly code: ChildValidationErrorCode) {
    super(
      code === 'invalid-display-name'
        ? 'Child display name must not be empty.'
        : 'Child date of birth must not be after the reference date.',
    );
    this.name = 'ChildValidationError';
  }
}

export function createChild(input: CreateChildInput, asOf: CalendarDate): Child {
  if (input.id.trim().length === 0) {
    throw new TypeError('Child id must not be empty.');
  }

  const displayName = input.displayName.trim();

  if (displayName.length === 0) {
    throw new ChildValidationError('invalid-display-name');
  }

  const dateOfBirth = createCalendarDate(input.dateOfBirth);

  if (compareCalendarDates(dateOfBirth, asOf) > 0) {
    throw new ChildValidationError('future-date-of-birth');
  }

  return {
    id: input.id,
    displayName,
    dateOfBirth,
  };
}
