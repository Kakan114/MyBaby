import { describe, expect, it } from 'vitest';
import { getLocalDayContext } from './local-day-context';

function inZone<T>(zone: string, operation: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try { return operation(); } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe('local Today day context', () => {
  it.each([
    ['2026-03-29T12:00:00Z', '2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', 23],
    ['2026-10-25T12:00:00Z', '2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', 25],
    ['2026-02-28T12:00:00Z', '2026-02-28', '2026-02-27T23:00:00Z', '2026-02-28T23:00:00Z', 24],
  ])('captures Stockholm %s', (now, calendarDate, start, end, hours) => inZone('Europe/Stockholm', () => {
    const day = getLocalDayContext(Date.parse(now));
    expect(day).toEqual({
      calendarDate, startEpochMs: Date.parse(start), endEpochMs: Date.parse(end),
      timeZone: 'Europe/Stockholm',
    });
    expect(day.endEpochMs - day.startEpochMs).toBe(hours * 3_600_000);
  }));

  it('changes calendar date and bounds at local midnight', () => inZone('Europe/Stockholm', () => {
    const before = getLocalDayContext(Date.parse('2026-10-06T21:59:59.999Z'));
    const after = getLocalDayContext(Date.parse('2026-10-06T22:00:00Z'));
    expect(before.calendarDate).toBe('2026-10-06');
    expect(after.calendarDate).toBe('2026-10-07');
    expect(before.endEpochMs).toBe(after.startEpochMs);
  }));

  it('re-evaluates the device timezone at the same instant', () => {
    const now = Date.parse('2026-10-06T22:30:00Z');
    const utc = inZone('UTC', () => getLocalDayContext(now));
    const stockholm = inZone('Europe/Stockholm', () => getLocalDayContext(now));
    expect(utc.calendarDate).toBe('2026-10-06');
    expect(stockholm.calendarDate).toBe('2026-10-07');
    expect(utc.startEpochMs).not.toBe(stockholm.startEpochMs);
  });

  it.each([NaN, Infinity, -1, 0.5, 8_640_000_000_000_001])('rejects invalid clock %s', (now) => {
    expect(() => getLocalDayContext(now)).toThrow();
  });
});

describe('midnight timezone transitions', () => {
  it('uses the first valid local time when midnight is skipped', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'America/Sao_Paulo';
    try {
      const before = getLocalDayContext(Date.parse('2018-11-04T02:30:00Z'));
      const after = getLocalDayContext(Date.parse('2018-11-04T12:00:00Z'));
      expect(before.calendarDate).toBe('2018-11-03');
      expect(before.endEpochMs).toBe(Date.parse('2018-11-04T03:00:00Z'));
      expect(after.startEpochMs).toBe(before.endEpochMs);
      expect(after.endEpochMs).toBe(Date.parse('2018-11-05T02:00:00Z'));
      expect(after.endEpochMs - after.startEpochMs).toBe(23 * 3_600_000);
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
});
