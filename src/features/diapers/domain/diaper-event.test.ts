import { describe, expect, it } from 'vitest';
import { createDiaperEvent, DiaperValidationError } from './diaper-event';

describe('DiaperEvent', () => {
  it.each(['wet', 'dirty', 'mixed'] as const)('creates %s events', (kind) => {
    expect(createDiaperEvent({ id: 'event', childId: 'child', occurredAtEpochMs: 123, kind }))
      .toEqual({ id: 'event', childId: 'child', occurredAtEpochMs: 123, kind });
  });
  it.each([
    [{ id: ' ', childId: 'child', occurredAtEpochMs: 1, kind: 'wet' }, 'invalid-identity'],
    [{ id: 'id', childId: '', occurredAtEpochMs: 1, kind: 'wet' }, 'invalid-identity'],
    [{ id: 'id', childId: 'child', occurredAtEpochMs: 1.5, kind: 'wet' }, 'invalid-timestamp'],
    [{ id: 'id', childId: 'child', occurredAtEpochMs: Number.MAX_SAFE_INTEGER, kind: 'wet' }, 'invalid-timestamp'],
    [{ id: 'id', childId: 'child', occurredAtEpochMs: 1, kind: 'other' }, 'invalid-kind'],
  ])('rejects invalid values', (input, code) => {
    expect(() => createDiaperEvent(input as never)).toThrowError(DiaperValidationError);
    try { createDiaperEvent(input as never); } catch (error) { expect(error).toMatchObject({ code }); }
  });
});
