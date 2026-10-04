import { describe, expect, it } from 'vitest';

import { createCalendarDate } from './calendar-date';
import { ChildValidationError, createChild } from './child';

const asOf = createCalendarDate('2025-06-15');

describe('createChild', () => {
  it('trims the display name', () => {
    const child = createChild(
      { id: 'opaque-child-id', displayName: '  Kim  ', dateOfBirth: '2025-01-10' },
      asOf,
    );

    expect(child).toEqual({
      id: 'opaque-child-id',
      displayName: 'Kim',
      dateOfBirth: '2025-01-10',
    });
  });

  it('rejects an empty display name', () => {
    const error = captureError(() =>
      createChild({ id: 'opaque-child-id', displayName: '', dateOfBirth: '2025-01-10' }, asOf),
    );

    expect(error).toBeInstanceOf(ChildValidationError);
    expect(error).toMatchObject({ code: 'invalid-display-name' });
  });

  it('rejects a whitespace-only display name', () => {
    const error = captureError(() =>
      createChild({ id: 'opaque-child-id', displayName: '   ', dateOfBirth: '2025-01-10' }, asOf),
    );

    expect(error).toBeInstanceOf(ChildValidationError);
    expect(error).toMatchObject({ code: 'invalid-display-name' });
  });

  it('rejects an empty child id', () => {
    expect(() =>
      createChild({ id: '', displayName: 'Kim', dateOfBirth: '2025-01-10' }, asOf),
    ).toThrow(TypeError);
  });

  it('rejects a date of birth after the reference date', () => {
    const error = captureError(() =>
      createChild({ id: 'opaque-child-id', displayName: 'Kim', dateOfBirth: '2025-06-16' }, asOf),
    );

    expect(error).toBeInstanceOf(ChildValidationError);
    expect(error).toMatchObject({ code: 'future-date-of-birth' });
  });
});

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error('Expected action to throw.');
}
