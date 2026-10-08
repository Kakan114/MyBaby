import type { GrowthValues } from '../application/growth';
import { type GrowthMeasurement, type LengthMethod } from '../domain/growth-measurement';
import { parseWeightKg, parseLengthCm, parseHeadCircumferenceCm, formatWeightKg, formatLengthCm, formatHeadCircumferenceCm } from '../domain/growth-units';
import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';

export type GrowthDraft = Readonly<{ date: CalendarDate | null; weight: string; length: string; head: string; method: LengthMethod | null }>;
export type GrowthField = keyof GrowthDraft;
export type GrowthFieldErrors = Partial<Record<GrowthField | 'measurements', string>>;
export const emptyGrowthDraft: GrowthDraft = Object.freeze({ date: null, weight: '', length: '', head: '', method: null });
export function growthDraftFromMeasurement(value: GrowthMeasurement): GrowthDraft {
  return { date: value.measuredOn, weight: value.weightGrams === null ? '' : formatWeightKg(value.weightGrams),
    length: value.lengthMm === null ? '' : formatLengthCm(value.lengthMm),
    head: value.headCircumferenceMm === null ? '' : formatHeadCircumferenceCm(value.headCircumferenceMm), method: value.lengthMethod };
}
export function parseGrowthDraft(draft: GrowthDraft): { values: GrowthValues | null; errors: GrowthFieldErrors } {
  const errors: GrowthFieldErrors = {};
  let date: CalendarDate | null = null;
  try { if (draft.date === null) throw new Error(); date = createCalendarDate(draft.date); } catch { errors.date = 'date'; }
  const parse = (field: 'weight' | 'length' | 'head', parser: (value: string) => number) => {
    if (draft[field].trim() === '') return null;
    try { return parser(draft[field]); } catch { errors[field] = field; return null; }
  };
  const weightGrams = parse('weight', parseWeightKg);
  const lengthMm = parse('length', parseLengthCm);
  const headCircumferenceMm = parse('head', parseHeadCircumferenceCm);
  if ([draft.weight, draft.length, draft.head].every(value => value.trim() === '')) errors.measurements = 'measurements';
  if (draft.length.trim() !== '' && draft.method === null) errors.method = 'method';
  return { errors, values: Object.keys(errors).length || date === null ? null : {
    measuredOn: date, weightGrams, lengthMm, headCircumferenceMm, lengthMethod: lengthMm === null ? null : draft.method,
  } };
}
