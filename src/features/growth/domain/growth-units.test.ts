import { describe, expect, it } from 'vitest';
import { parseWeightKg, parseLengthCm, parseHeadCircumferenceCm,
  formatWeightKg, formatLengthCm, formatHeadCircumferenceCm } from './growth-units';
import { GrowthValidationError } from './growth-measurement';

const units = [
  { name: 'weight', parse: parseWeightKg, format: formatWeightKg, ceiling: 200_000 },
  { name: 'length', parse: parseLengthCm, format: formatLengthCm, ceiling: 3_000 },
  { name: 'head', parse: parseHeadCircumferenceCm, format: formatHeadCircumferenceCm, ceiling: 1_000 },
] as const;
for (const unit of units) describe(unit.name, () => {
  it.each(['', ' ', '0', '0,0', '-1', '+1', '.5', ',5', '1.', '1,', '1e2', '0x10', 'NaN', 'Infinity',
    '1 000', '1,2.3', '1..2', '1,,2', '1 kg', '1\n2', '９', '9007199254740993'])('rejects malformed/nonpositive %j', text => {
    expect(() => unit.parse(text)).toThrow(GrowthValidationError);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, unit.ceiling + 1])('rejects invalid formatting input %s', value => {
    expect(() => unit.format(value)).toThrow(GrowthValidationError);
  });
  it('round trips every supported integer exactly with both decimal separators', () => {
    for (let value = 1; value <= unit.ceiling; value++) {
      for (const separator of [',', '.'] as const) {
        if (unit.parse(unit.format(value, separator)) !== value) throw new Error('Integer round trip failed');
      }
    }
    expect(unit.parse(unit.format(unit.ceiling))).toBe(unit.ceiling);
  });
});
describe('exact decimal parsing', () => {
  it.each([['3,450', 3450], ['3.450', 3450], ['0,001', 1], ['200.000', 200000], [' 003,45 ', 3450]])(
    'parses kg %j as %s grams', (input, grams) => { expect(parseWeightKg(input)).toBe(grams); });
  it.each(['1.0000', '1,2345', '0.0001', '200.001'])('rejects weight precision/ceiling %s without rounding', input => {
    expect(() => parseWeightKg(input)).toThrow(GrowthValidationError);
  });
  it.each([['51,2', 512], ['51.2', 512], ['0,1', 1], ['300', 3000]])('parses length %j as %s mm', (input, mm) => {
    expect(parseLengthCm(input)).toBe(mm);
  });
  it.each(['51.20', '0.01', '300.1'])('rejects length precision/ceiling %s', input => {
    expect(() => parseLengthCm(input)).toThrow(GrowthValidationError);
  });
  it.each([['35,2', 352], ['35.2', 352], ['100.0', 1000]])('parses head %j as %s mm', (input, mm) => {
    expect(parseHeadCircumferenceCm(input)).toBe(mm);
  });
  it.each(['35.20', '0.01', '100.1'])('rejects head precision/ceiling %s', input => {
    expect(() => parseHeadCircumferenceCm(input)).toThrow(GrowthValidationError);
  });
  it('formats exact Swedish numeric text without fabricated precision or units', () => {
    expect(formatWeightKg(3450)).toBe('3,45');
    expect(formatWeightKg(1)).toBe('0,001');
    expect(formatWeightKg(3000)).toBe('3');
    expect(formatLengthCm(512)).toBe('51,2');
    expect(formatHeadCircumferenceCm(350)).toBe('35');
  });
});
