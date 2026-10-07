import { describe, expect, it } from 'vitest';
import { completedSleepUnionDurationMs, type SleepEvent } from './sleep';
import { getLocalDayContext } from '../../today/data/local-day-context';

function event(start: number, end: number, id = 'event'): SleepEvent {
  return { id, childId: 'child', startedAtEpochMs: start, endedAtEpochMs: end };
}
const range = { startEpochMs: 100, endEpochMs: 200 };

describe('completed sleep clipped interval union', () => {
  it.each([
    [[], 0],
    [[event(0, 100), event(200, 300)], 0],
    [[event(50, 150)], 50],
    [[event(150, 250)], 50],
    [[event(0, 300)], 100],
    [[event(150, 190), event(110, 160)], 80],
    [[event(110, 190), event(120, 130), event(110, 190)], 80],
    [[event(100, 150), event(150, 200)], 100],
    [[event(110, 120), event(160, 170)], 20],
  ] as const)('unions %j to %i ms', (events, expected) => {
    const original = JSON.stringify(events);
    expect(completedSleepUnionDurationMs(events, range)).toBe(expected);
    expect(JSON.stringify(events)).toBe(original);
  });

  it('handles thousands of duplicate and disjoint intervals without multiplying duration', () => {
    const events = Array.from({ length: 5000 }, (_, i) => event(110 + i % 2 * 40, 120 + i % 2 * 40, String(i)));
    expect(completedSleepUnionDurationMs(events, range)).toBe(20);
  });

  it.each([['2026-03-29T12:00:00Z', 23], ['2026-10-25T12:00:00Z', 25]] as const)(
    'clips a multi-day event across DST %s', (now, hours) => {
      const previous = process.env.TZ;
      process.env.TZ = 'Europe/Stockholm';
      try {
        const day = getLocalDayContext(Date.parse(now));
        const events = [
          event(day.startEpochMs - 1000, day.endEpochMs + 1000),
          event(day.startEpochMs, day.endEpochMs),
        ];
        expect(completedSleepUnionDurationMs(events, day)).toBe(hours * 3_600_000);
      } finally {
        if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
      }
    },
  );

  it('rejects malformed events and invalid ranges', () => {
    expect(() => completedSleepUnionDurationMs([event(150, 140)], range)).toThrow();
    expect(() => completedSleepUnionDurationMs([], { startEpochMs: 2, endEpochMs: 1 })).toThrow();
  });
});
