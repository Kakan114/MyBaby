import { describe, expect, it } from 'vitest';
import { createCalendarDate } from '../../children/domain/calendar-date';
import { emptyGrowthDraft, parseGrowthDraft, growthDraftFromMeasurement } from './growth-form';

describe('Growth form', () => {
  it('requires a deliberate date and at least one value', () => {
    expect(parseGrowthDraft(emptyGrowthDraft).errors).toEqual({ date: 'date', measurements: 'measurements' });
  });
  it('parses exact comma and point values for complete or partial sessions', () => {
    const date = createCalendarDate('2024-02-29');
    expect(parseGrowthDraft({ ...emptyGrowthDraft, date, weight: '4,567' }).values).toEqual({
      measuredOn: date, weightGrams: 4567, lengthMm: null, headCircumferenceMm: null, lengthMethod: null,
    });
    const result = parseGrowthDraft({ date, weight: '4.567', length: '57,8', head: '34.5', method: 'unknown' });
    expect(result.values).toMatchObject({ weightGrams: 4567, lengthMm: 578, headCircumferenceMm: 345, lengthMethod: 'unknown' });
  });
  it.each(['0', '-1', '4,5678', '4..2', 'NaN', '201'])('rejects weight %s without rounding', weight => {
    expect(parseGrowthDraft({ ...emptyGrowthDraft, date: createCalendarDate('2026-10-08'), weight }).errors.weight).toBe('weight');
  });
  it('requires an explicit length method without inferring it', () => {
    expect(parseGrowthDraft({ ...emptyGrowthDraft, date: createCalendarDate('2026-10-08'), length: '50' }).errors.method).toBe('method');
  });
  it('leaves absent length method null even if a prior selection was made', () => {
    expect(parseGrowthDraft({ ...emptyGrowthDraft, date: createCalendarDate('2026-10-08'), weight: '4', method: 'standing' }).values?.lengthMethod).toBeNull();
  });
  it('round trips exact stored values into editable Swedish fields', () => {
    const measurement = { id: 'id', childId: 'a', measuredOn: createCalendarDate('2024-02-29'), weightGrams: 4567,
      lengthMm: 567, headCircumferenceMm: 345, lengthMethod: 'lying' as const, revision: 4 };
    const draft = growthDraftFromMeasurement(measurement);
    expect(draft).toMatchObject({ weight: '4,567', length: '56,7', head: '34,5', method: 'lying' });
    expect(parseGrowthDraft(draft).values).toMatchObject({
      weightGrams: 4567, lengthMm: 567, headCircumferenceMm: 345, measuredOn: '2024-02-29',
    });
  });
});
