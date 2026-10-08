import { createCalendarDate, type CalendarDate } from '../../children/domain/calendar-date';

export const lengthMethods = ['lying', 'standing', 'unknown'] as const;
export type LengthMethod = typeof lengthMethods[number];

// Broad input-error guardrails, not medical thresholds or age/percentile limits.
export const growthInputCeilings = Object.freeze({
  weightGrams: 200_000, lengthMm: 3_000, headCircumferenceMm: 1_000,
});
export type GrowthMeasurement = Readonly<{
  id: string; childId: string; measuredOn: CalendarDate;
  weightGrams: number | null; lengthMm: number | null;
  headCircumferenceMm: number | null; lengthMethod: LengthMethod | null;
  revision: number;
}>;
export type GrowthValidationErrorCode =
  | 'invalid-identity' | 'invalid-measurement-date' | 'missing-measurements'
  | 'invalid-weight' | 'invalid-length' | 'invalid-head-circumference'
  | 'invalid-length-method' | 'invalid-revision';
export class GrowthValidationError extends Error {
  constructor(readonly code: GrowthValidationErrorCode) {
    super('The growth measurement is invalid.');
    this.name = 'GrowthValidationError';
  }
}
export function assertGrowthValue(value: number, ceiling: number, code: GrowthValidationErrorCode): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > ceiling) throw new GrowthValidationError(code);
}

/** Date eligibility relative to birth/today belongs to application operations. */
export function createGrowthMeasurement(input: GrowthMeasurement): GrowthMeasurement {
  if (typeof input.id !== 'string' || input.id.trim().length === 0 ||
      typeof input.childId !== 'string' || input.childId.trim().length === 0) {
    throw new GrowthValidationError('invalid-identity');
  }
  let measuredOn: CalendarDate;
  try {
    if (typeof input.measuredOn !== 'string') throw new GrowthValidationError('invalid-measurement-date');
    measuredOn = createCalendarDate(input.measuredOn);
  } catch { throw new GrowthValidationError('invalid-measurement-date'); }
  if (input.weightGrams === null && input.lengthMm === null && input.headCircumferenceMm === null) {
    throw new GrowthValidationError('missing-measurements');
  }
  if (input.weightGrams !== null) assertGrowthValue(input.weightGrams, growthInputCeilings.weightGrams, 'invalid-weight');
  if (input.lengthMm !== null) assertGrowthValue(input.lengthMm, growthInputCeilings.lengthMm, 'invalid-length');
  if (input.headCircumferenceMm !== null) {
    assertGrowthValue(input.headCircumferenceMm, growthInputCeilings.headCircumferenceMm, 'invalid-head-circumference');
  }
  if (input.lengthMm === null ? input.lengthMethod !== null : !lengthMethods.includes(input.lengthMethod as LengthMethod)) {
    throw new GrowthValidationError('invalid-length-method');
  }
  if (!Number.isSafeInteger(input.revision) || input.revision <= 0) throw new GrowthValidationError('invalid-revision');
  return Object.freeze({
    id: input.id, childId: input.childId, measuredOn, weightGrams: input.weightGrams,
    lengthMm: input.lengthMm, headCircumferenceMm: input.headCircumferenceMm,
    lengthMethod: input.lengthMethod, revision: input.revision,
  });
}
