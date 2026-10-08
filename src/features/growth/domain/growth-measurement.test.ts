import { describe, expect, it } from 'vitest';
import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';
import { createGrowthMeasurement, type GrowthMeasurement, lengthMethods } from './growth-measurement';

const complete: GrowthMeasurement = {
  id: 'measurement-1', childId: 'child-1', measuredOn: createCalendarDate('2024-02-29'),
  weightGrams: 3450, lengthMm: 512, headCircumferenceMm: 352, lengthMethod: 'lying', revision: 1,
};
function make(patch: Partial<GrowthMeasurement> = {}) { return createGrowthMeasurement({ ...complete, ...patch }); }

describe('Growth measurement', () => {
  it('preserves a complete session without inferring values', () => { expect(make()).toEqual(complete); });
  it.each([
    { weightGrams: 500, lengthMm: null, headCircumferenceMm: null, lengthMethod: null },
    { weightGrams: null, lengthMm: 250, headCircumferenceMm: null, lengthMethod: 'unknown' },
    { weightGrams: null, lengthMm: null, headCircumferenceMm: 200, lengthMethod: null },
  ] as const)('accepts a partial session %j', patch => { expect(make(patch)).toMatchObject(patch); });
  it.each(lengthMethods)('preserves explicit %s method', lengthMethod => {
    expect(make({ lengthMethod }).lengthMethod).toBe(lengthMethod);
  });
  it('accepts missing length only with a null method', () => {
    expect(make({ lengthMm: null, lengthMethod: null }).lengthMethod).toBeNull();
  });
  it.each([null, undefined, 'automatic', ''] as const)('rejects invalid method %s with length', lengthMethod => {
    expect(() => make({ lengthMethod: lengthMethod as GrowthMeasurement['lengthMethod'] }))
      .toThrow(expect.objectContaining({ code: 'invalid-length-method' }));
  });
  it.each(lengthMethods)('rejects %s method without length', lengthMethod => {
    expect(() => make({ lengthMm: null, lengthMethod })).toThrow(expect.objectContaining({ code: 'invalid-length-method' }));
  });
  it('requires at least one measurement', () => {
    expect(() => make({ weightGrams: null, lengthMm: null, headCircumferenceMm: null, lengthMethod: null }))
      .toThrow(expect.objectContaining({ code: 'missing-measurements' }));
  });
  for (const [field, ceiling, code] of [
    ['weightGrams', 200_000, 'invalid-weight'], ['lengthMm', 3_000, 'invalid-length'],
    ['headCircumferenceMm', 1_000, 'invalid-head-circumference'],
  ] as const) {
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, ceiling + 1, undefined])(
      `rejects invalid ${field}: %s`, value => {
        expect(() => make({ [field]: value })).toThrow(expect.objectContaining({ code }));
      });
    it.each([1, ceiling])(`accepts ${field} guardrail boundary %s`, value => {
      expect(make({ [field]: value })[field]).toBe(value);
    });
  }
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined])('rejects revision %s', revision => {
    expect(() => make({ revision })).toThrow(expect.objectContaining({ code: 'invalid-revision' }));
  });
  it.each([1, 2, Number.MAX_SAFE_INTEGER])('accepts positive safe revision %s', revision => {
    expect(make({ revision }).revision).toBe(revision);
  });
  it.each(['2023-02-29', '1900-02-29', '2024-04-31', '2024-2-29', '', '2024-02-29T00:00:00Z'])('rejects invalid date %s', date => {
    expect(() => make({ measuredOn: date as CalendarDate })).toThrow(expect.objectContaining({ code: 'invalid-measurement-date' }));
  });
  it.each(['2000-02-29', '0001-01-01', '9999-12-31'])('validates date %s without birth/current-date policy', date => {
    expect(make({ measuredOn: date as CalendarDate }).measuredOn).toBe(date);
  });
  it.each(['id', 'childId'] as const)('requires nonblank %s', field => {
    expect(() => make({ [field]: '  ' })).toThrow(expect.objectContaining({ code: 'invalid-identity' }));
  });
  it('allows different sessions on the same day', () => {
    expect(make({ id: 'measurement-2' }).measuredOn).toBe(make().measuredOn);
  });
  it('returns an immutable detached object without freezing the input', () => {
    const input = { ...complete };
    const result = createGrowthMeasurement(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    input.weightGrams = 4000;
    expect(result.weightGrams).toBe(3450);
    expect(Reflect.set(result, 'weightGrams', 4000)).toBe(false);
  });
});
