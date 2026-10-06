import { describe, expect, it } from 'vitest';

import {
  createBottleFeedingDetails,
  createBreastFeedingDetails,
} from './feeding-form';

describe('feeding form conversion', () => {
  it('converts usable minute input explicitly to domain seconds', () => {
    expect(createBreastFeedingDetails('1,5', '2')).toEqual({
      kind: 'breast',
      leftDurationSeconds: 90,
      rightDurationSeconds: 120,
    });
    expect(createBreastFeedingDetails('', '3')).toMatchObject({
      leftDurationSeconds: 0,
      rightDurationSeconds: 180,
    });
  });

  it.each([
    ['', ''],
    ['0', '0'],
    ['-1', '2'],
    ['0.01', '0'],
    ['not-a-number', '1'],
  ])('rejects invalid minute input %s/%s', (left, right) => {
    expect(() => createBreastFeedingDetails(left, right)).toThrow(
      expect.objectContaining({ code: 'invalid-duration' }),
    );
  });

  it('accepts Swedish decimal input and preserves bottle semantics', () => {
    expect(createBottleFeedingDetails('72,5', 'mixed')).toEqual({
      kind: 'bottle',
      amountMl: 72.5,
      contents: 'mixed',
    });
  });

  it.each(['', '0', '-5', '12.34', 'milk'])(
    'rejects invalid bottle amount %s',
    (amount) => {
      expect(() => createBottleFeedingDetails(amount, 'formula')).toThrow(
        expect.objectContaining({ code: 'invalid-amount' }),
      );
    },
  );
});
