import { describe, expect, it } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import {
  createMilestoneEntry,
  MILESTONE_CUSTOM_TITLE_MAX_LENGTH,
  MILESTONE_NOTE_MAX_LENGTH,
  MilestoneValidationError,
  type MilestoneEntry,
} from './milestone-entry';

const base = {
  id: 'milestone-id',
  childId: 'child-id',
  occurredOn: createCalendarDate('2024-02-29'),
  note: null,
  revision: 1,
} as const;

function expectInvalid(input: unknown, code: string): void {
  expect(() => createMilestoneEntry(input as MilestoneEntry)).toThrowError(MilestoneValidationError);
  try {
    createMilestoneEntry(input as MilestoneEntry);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

describe('MilestoneEntry', () => {
  it('creates and freezes a predefined milestone without storing display text', () => {
    const entry = createMilestoneEntry({
      ...base,
      subject: { kind: 'predefined', definitionId: 'social.first-smile' },
    });
    expect(entry).toEqual({
      ...base,
      subject: { kind: 'predefined', definitionId: 'social.first-smile' },
    });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.subject)).toBe(true);
    expect(entry.subject).not.toHaveProperty('title');
  });

  it('creates a one-off custom milestone and trims its title and note', () => {
    const entry = createMilestoneEntry({
      ...base,
      subject: { kind: 'custom', title: '  Första utflykten  ' },
      note: '  En fin dag tillsammans.  ',
    });
    expect(entry.subject).toEqual({ kind: 'custom', title: 'Första utflykten' });
    expect(entry.note).toBe('En fin dag tillsammans.');
    expect(entry.subject).not.toHaveProperty('definitionId');
  });

  it.each([
    { kind: 'predefined', definitionId: 'social.first-smile', title: 'Both' },
    { kind: 'custom', title: 'Both', definitionId: 'social.first-smile' },
    { kind: 'predefined' },
    { kind: 'custom' },
    { kind: 'other', title: 'Other' },
    null,
  ])('rejects a malformed or non-exclusive subject %#', (subject) => {
    expectInvalid({ ...base, subject }, 'invalid-subject');
  });

  it('rejects unknown predefined definition IDs', () => {
    expectInvalid({ ...base, subject: { kind: 'predefined', definitionId: 'motor.unknown' } }, 'unknown-definition');
  });

  it('accepts the custom-title boundary and rejects empty or over-limit titles', () => {
    const boundary = 'a'.repeat(MILESTONE_CUSTOM_TITLE_MAX_LENGTH);
    expect(createMilestoneEntry({ ...base, subject: { kind: 'custom', title: ` ${boundary} ` } }).subject)
      .toEqual({ kind: 'custom', title: boundary });
    for (const title of ['', '   ', 'a'.repeat(MILESTONE_CUSTOM_TITLE_MAX_LENGTH + 1)]) {
      expectInvalid({ ...base, subject: { kind: 'custom', title } }, 'invalid-custom-title');
    }
  });

  it('normalizes absent or blank notes and accepts the note boundary', () => {
    const subject = { kind: 'custom', title: 'Egen milstolpe' } as const;
    expect(createMilestoneEntry({ ...base, subject, note: null }).note).toBeNull();
    expect(createMilestoneEntry({ ...base, subject, note: ' \n\t ' }).note).toBeNull();
    const boundary = 'n'.repeat(MILESTONE_NOTE_MAX_LENGTH);
    expect(createMilestoneEntry({ ...base, subject, note: ` ${boundary} ` }).note).toBe(boundary);
    expectInvalid({ ...base, subject, note: 'n'.repeat(MILESTONE_NOTE_MAX_LENGTH + 1) }, 'invalid-note');
    expectInvalid({ ...base, subject, note: 123 }, 'invalid-note');
  });

  it('accepts a valid leap-day CalendarDate and rejects invalid calendar dates', () => {
    const subject = { kind: 'predefined', definitionId: 'teeth.first-tooth' } as const;
    expect(createMilestoneEntry({ ...base, subject }).occurredOn).toBe('2024-02-29');
    for (const occurredOn of ['2023-02-29', '2024-13-01', '2024-01-32', '2024/02/29', 123]) {
      expectInvalid({ ...base, subject, occurredOn }, 'invalid-occurrence-date');
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid revision %s',
    (revision) => {
      expectInvalid({
        ...base,
        revision,
        subject: { kind: 'predefined', definitionId: 'communication.first-word' },
      }, 'invalid-revision');
    },
  );

  it.each([
    { id: '', childId: 'child-id' },
    { id: '   ', childId: 'child-id' },
    { id: 'id', childId: '' },
    { id: 'id', childId: ' \n ' },
    { id: 123, childId: 'child-id' },
    { id: 'id', childId: null },
  ])('rejects invalid identities %#', ({ id, childId }) => {
    expectInvalid({
      ...base,
      id,
      childId,
      subject: { kind: 'predefined', definitionId: 'motor.first-steps' },
    }, 'invalid-identity');
  });
});
