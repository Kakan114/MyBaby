import { describe, expect, it } from 'vitest';

import { createSleepEvent } from '../domain/sleep';
import {
  formatActiveSleepElapsed,
  formatSleepDateHeading,
  formatSleepDuration,
  formatSleepRange,
  groupSleepByLocalEndDate,
} from './sleep-format';

describe('sleep presentation formatting', () => {
  it.each([
    [8_000, '00:08'],
    [154_999, '02:34'],
    [3_599_999, '59:59'],
    [3_600_000, '01:00:00'],
    [4_365_000, '01:12:45'],
    [43_449_000, '12:04:09'],
  ] as const)('formats live elapsed %i ms as %s', (elapsedMs, expected) => {
    expect(formatActiveSleepElapsed(elapsedMs)).toBe(expected);
  });

  it('keeps live elapsed nonnegative and floors subsecond display only', () => {
    expect(formatActiveSleepElapsed(-1)).toBe('00:00');
    expect(formatActiveSleepElapsed(999)).toBe('00:00');
    expect(formatActiveSleepElapsed(1_999)).toBe('00:01');
  });

  it.each([
    [2_000, '2 sek'],
    [59_000, '59 sek'],
    [60_000, '1 min'],
    [65_000, '1 min 5 sek'],
    [754_000, '12 min 34 sek'],
    [4_365_000, '1 h 12 min'],
  ] as const)('formats completed duration %i ms as %s', (durationMs, expected) => {
    expect(formatSleepDuration(durationMs)).toBe(expected);
  });

  it('keeps completed durations concise from one hour onward', () => {
    expect(formatSleepDuration(3_900_000)).toBe('1 h 5 min');
    expect(formatSleepDuration(7_200_000)).toBe('2 h');
  });

  it('does not expose timezone offsets for ordinary same-minute or multi-minute ranges', () => {
    const zone = 'Europe/Stockholm';
    const sameMinute = createSleepEvent({
      id: 'short', childId: 'child',
      startedAtEpochMs: Date.parse('2026-10-07T10:54:01Z'),
      endedAtEpochMs: Date.parse('2026-10-07T10:54:03Z'),
    });
    const multiMinute = createSleepEvent({
      id: 'normal', childId: 'child',
      startedAtEpochMs: Date.parse('2026-10-07T10:54:00Z'),
      endedAtEpochMs: Date.parse('2026-10-07T10:56:00Z'),
    });
    expect(formatSleepRange(sameMinute, zone)).toBe('12:54 – 12:54');
    expect(formatSleepRange(multiMinute, zone)).toBe('12:54 – 12:56');
    expect(`${formatSleepRange(sameMinute, zone)} ${formatSleepRange(multiMinute, zone)}`)
      .not.toMatch(/GMT|UTC|tidsomställningen/);
  });

  it('uses local dates for today, yesterday, year boundaries, and grouping', () => {
    const zone = 'America/Los_Angeles';
    const now = Date.parse('2026-01-01T08:30:00Z');
    expect(formatSleepDateHeading(Date.parse('2026-01-01T07:30:00Z'), now, {
      today: 'Idag', yesterday: 'Igår',
    }, zone)).toBe('Igår');
    const events = [createSleepEvent({
      id: 'one', childId: 'child', startedAtEpochMs: Date.parse('2026-01-01T07:00:00Z'),
      endedAtEpochMs: Date.parse('2026-01-01T09:00:00Z'),
    })];
    expect(groupSleepByLocalEndDate(events, zone)[0]?.key).toBe('2026-01-01');
  });

  it('makes cross-midnight and DST ranges unambiguous while duration stays epoch based', () => {
    const crossMidnight = createSleepEvent({
      id: 'one', childId: 'child',
      startedAtEpochMs: Date.parse('2026-03-28T22:30:00Z'),
      endedAtEpochMs: Date.parse('2026-03-29T01:30:00Z'),
    });
    expect(formatSleepRange(crossMidnight, 'Europe/Stockholm')).toMatch(/28 mars.*29 mars/);
    expect(formatSleepDuration(crossMidnight.endedAtEpochMs - crossMidnight.startedAtEpochMs))
      .toBe('3 h');
    const fallback = createSleepEvent({
      id: 'fallback', childId: 'child',
      startedAtEpochMs: Date.parse('2026-10-25T00:30:00Z'),
      endedAtEpochMs: Date.parse('2026-10-25T01:15:00Z'),
    });
    expect(formatSleepRange(fallback, 'Europe/Stockholm')).toBe(
      '02:30 (före tidsomställningen) – 02:15 (efter tidsomställningen)',
    );
    const overnightFallback = createSleepEvent({
      id: 'overnight-fallback', childId: 'child',
      startedAtEpochMs: Date.parse('2026-10-24T21:30:00Z'),
      endedAtEpochMs: Date.parse('2026-10-25T01:15:00Z'),
    });
    expect(formatSleepRange(overnightFallback, 'Europe/Stockholm')).toBe(
      '24 okt. 23:30 (före tidsomställningen) – 25 okt. 02:15 (efter tidsomställningen)',
    );
  });
});
