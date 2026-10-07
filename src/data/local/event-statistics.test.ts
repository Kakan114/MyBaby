import { describe, expect, it } from 'vitest';
import { readEventStatistics } from './event-statistics';

describe('persisted event statistics validation', () => {
  it('represents empty canonical data', () => {
    expect(readEventStatistics({ day_count: 0, latest_epoch_ms: null }))
      .toEqual({ dayCount: 0, latestEpochMs: null });
  });
  it.each([
    undefined,
    { day_count: '1', latest_epoch_ms: null },
    { day_count: -1, latest_epoch_ms: null },
    { day_count: 0.5, latest_epoch_ms: null },
    { day_count: 1, latest_epoch_ms: '123' },
    { day_count: 1, latest_epoch_ms: NaN },
    { day_count: 1, latest_epoch_ms: -1 },
    { day_count: 1, latest_epoch_ms: 8_640_000_000_000_001 },
  ])('rejects corrupt aggregate values %j', (row) => {
    expect(() => readEventStatistics(row)).toThrow();
  });
});
