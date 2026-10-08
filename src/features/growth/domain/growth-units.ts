import { assertGrowthValue, growthInputCeilings, GrowthValidationError, type GrowthValidationErrorCode } from './growth-measurement';

export type DecimalSeparator = ',' | '.';
function parseScaled(input: string, precision: number, ceiling: number, code: GrowthValidationErrorCode): number {
  if (typeof input !== 'string') throw new GrowthValidationError(code);
  const match = /^(\d+)(?:[,.](\d+))?$/.exec(input.trim());
  if (!match || (match[2]?.length ?? 0) > precision) throw new GrowthValidationError(code);
  // Assemble integer digits directly; never multiply or round a decimal float.
  const value = Number(match[1] + (match[2] ?? '').padEnd(precision, '0'));
  assertGrowthValue(value, ceiling, code);
  return value;
}
function formatScaled(value: number, precision: number, ceiling: number, code: GrowthValidationErrorCode,
  separator: DecimalSeparator): string {
  assertGrowthValue(value, ceiling, code);
  if (separator !== ',' && separator !== '.') throw new GrowthValidationError(code);
  const scale = 10 ** precision;
  const whole = Math.floor(value / scale);
  const fraction = String(value % scale).padStart(precision, '0').replace(/0+$/, '');
  return fraction ? String(whole) + separator + fraction : String(whole);
}
export function parseWeightKg(input: string): number {
  return parseScaled(input, 3, growthInputCeilings.weightGrams, 'invalid-weight');
}
export function parseLengthCm(input: string): number {
  return parseScaled(input, 1, growthInputCeilings.lengthMm, 'invalid-length');
}
export function parseHeadCircumferenceCm(input: string): number {
  return parseScaled(input, 1, growthInputCeilings.headCircumferenceMm, 'invalid-head-circumference');
}
// Exact editable numeric text; unit labels and translated wording belong in presentation.
export function formatWeightKg(value: number, separator: DecimalSeparator = ','): string {
  return formatScaled(value, 3, growthInputCeilings.weightGrams, 'invalid-weight', separator);
}
export function formatLengthCm(value: number, separator: DecimalSeparator = ','): string {
  return formatScaled(value, 1, growthInputCeilings.lengthMm, 'invalid-length', separator);
}
export function formatHeadCircumferenceCm(value: number, separator: DecimalSeparator = ','): string {
  return formatScaled(value, 1, growthInputCeilings.headCircumferenceMm, 'invalid-head-circumference', separator);
}
