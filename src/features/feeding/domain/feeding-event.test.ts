import { describe, expect, it } from 'vitest';

import {
  amountMlToTenths,
  bottleContentsValues,
  createFeedingEvent,
} from './feeding-event';

const common = {
  id: 'feeding-1',
  childId: 'child-1',
  occurredAtEpochMs: 1_765_000_000_123,
} as const;

describe('feeding event', () => {
  it.each([
    [120, 0],
    [0, 180],
    [120, 180],
  ])('accepts a breast feed with %i left and %i right seconds', (left, right) => {
    expect(createFeedingEvent({
      ...common,
      kind: 'breast',
      leftDurationSeconds: left,
      rightDurationSeconds: right,
    })).toMatchObject({ leftDurationSeconds: left, rightDurationSeconds: right });
  });

  it.each([
    [0, 0],
    [-1, 10],
    [10, -1],
    [1.5, 0],
    [0, Number.POSITIVE_INFINITY],
  ])('rejects invalid breast durations %s/%s', (left, right) => {
    expect(() => createFeedingEvent({
      ...common,
      kind: 'breast',
      leftDurationSeconds: left,
      rightDurationSeconds: right,
    })).toThrow(expect.objectContaining({ code: 'invalid-duration' }));
  });

  it.each(bottleContentsValues)('preserves the exact bottle contents %s', (contents) => {
    expect(createFeedingEvent({
      ...common,
      kind: 'bottle',
      amountMl: 72.5,
      contents,
    })).toMatchObject({ kind: 'bottle', amountMl: 72.5, contents });
  });

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    12.34,
  ])(
    'rejects invalid bottle amount %s',
    (amountMl) => {
      expect(() => createFeedingEvent({
        ...common,
        kind: 'bottle',
        amountMl,
        contents: 'formula',
      })).toThrow(expect.objectContaining({ code: 'invalid-amount' }));
    },
  );

  it('stores bottle amounts as exact tenths of a millilitre', () => {
    expect(amountMlToTenths(1)).toBe(10);
    expect(amountMlToTenths(62.5)).toBe(625);
    expect(() => amountMlToTenths(72.55)).toThrow(
      expect.objectContaining({ code: 'invalid-amount' }),
    );
  });

  it('rejects unknown bottle contents at the domain boundary', () => {
    expect(() => createFeedingEvent({
      ...common,
      kind: 'bottle',
      amountMl: 60,
      contents: 'unknown' as never,
    })).toThrow(expect.objectContaining({ code: 'invalid-contents' }));
  });

  it('requires an integer epoch-millisecond instant', () => {
    expect(() => createFeedingEvent({
      ...common,
      occurredAtEpochMs: 10.5,
      kind: 'bottle',
      amountMl: 60,
      contents: 'formula',
    })).toThrow(expect.objectContaining({ code: 'invalid-timestamp' }));
  });
});
