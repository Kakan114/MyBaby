import { describe, expect, it } from 'vitest';

import type { FeedingEvent } from '../domain/feeding-event';
import {
  formatAmountMl,
  formatFeedingDuration,
  formatFeedingHistoryValue,
  formatLocalClockTime,
  formatLocalDateHeading,
  groupFeedingsByLocalDate,
} from './feeding-history-format';

const labels = { today: 'Idag', yesterday: 'Igår' };
const zone = 'America/Los_Angeles';

describe('feeding history local calendar formatting', () => {
  it('formats today, yesterday, ordinary dates, and another year deterministically', () => {
    const now = Date.parse('2026-03-01T10:00:00-08:00');
    expect(formatLocalDateHeading(
      Date.parse('2026-03-01T00:05:00-08:00'), now, labels, zone,
    )).toBe('Idag');
    expect(formatLocalDateHeading(
      Date.parse('2026-02-28T23:55:00-08:00'), now, labels, zone,
    )).toBe('Igår');
    expect(formatLocalDateHeading(
      Date.parse('2026-02-01T12:00:00-08:00'), now, labels, zone,
    )).toBe('1 februari');
    expect(formatLocalDateHeading(
      Date.parse('2025-12-31T12:00:00-08:00'), now, labels, zone,
    )).toBe('31 december 2025');
  });

  it('uses local midnight rather than UTC for grouping and clock time', () => {
    const newer: FeedingEvent = {
      id: 'newer', childId: 'child-1',
      occurredAtEpochMs: Date.parse('2026-01-02T00:05:00-08:00'),
      kind: 'breast', leftDurationSeconds: 60, rightDurationSeconds: 0,
    };
    const older: FeedingEvent = {
      ...newer,
      id: 'older',
      occurredAtEpochMs: Date.parse('2026-01-01T23:55:00-08:00'),
    };

    expect(groupFeedingsByLocalDate([newer, older], zone).map((group) => group.dateKey))
      .toEqual(['2026-01-02', '2026-01-01']);
    expect(formatLocalClockTime(newer.occurredAtEpochMs, zone)).toBe('00:05');
  });

  it('derives yesterday by calendar date across a DST boundary', () => {
    const now = Date.parse('2026-03-09T00:15:00-07:00');
    const yesterday = Date.parse('2026-03-08T00:15:00-08:00');

    expect(formatLocalDateHeading(yesterday, now, labels, zone)).toBe('Igår');
  });
});

describe('feeding history value formatting', () => {
  const durationLabels = { minute: 'min', second: 'sek' };
  const valueLabels = {
    ...durationLabels,
    left: 'Vänster',
    right: 'Höger',
    bottleContents: {
      'expressed-breast-milk': 'Bröstmjölk',
      formula: 'Ersättning',
      mixed: 'Bröstmjölk + ersättning',
    },
  } as const;

  it.each([
    [720, '12 min'],
    [90, '1 min 30 sek'],
    [45, '45 sek'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatFeedingDuration(seconds, durationLabels)).toBe(expected);
  });

  it('formats Swedish ml values without an unnecessary decimal zero', () => {
    expect(formatAmountMl(1)).toBe('1 ml');
    expect(formatAmountMl(62.5)).toBe('62,5 ml');
  });

  it.each([
    [
      { kind: 'breast', leftDurationSeconds: 720, rightDurationSeconds: 0 } as const,
      'Vänster · 12 min',
    ],
    [
      { kind: 'breast', leftDurationSeconds: 0, rightDurationSeconds: 480 } as const,
      'Höger · 8 min',
    ],
    [
      { kind: 'breast', leftDurationSeconds: 90, rightDurationSeconds: 120 } as const,
      'Vänster 1 min 30 sek · Höger 2 min',
    ],
  ])('formats breast sides as %s', (details, expected) => {
    expect(formatFeedingHistoryValue({
      id: 'event', childId: 'child', occurredAtEpochMs: 0, ...details,
    }, valueLabels)).toBe(expected);
  });

  it.each([
    ['expressed-breast-milk', '1 ml · Bröstmjölk'],
    ['formula', '1 ml · Ersättning'],
    ['mixed', '1 ml · Bröstmjölk + ersättning'],
  ] as const)('formats bottle contents %s', (contents, expected) => {
    expect(formatFeedingHistoryValue({
      id: 'event', childId: 'child', occurredAtEpochMs: 0,
      kind: 'bottle', amountMl: 1, contents,
    }, valueLabels)).toBe(expected);
  });
});
