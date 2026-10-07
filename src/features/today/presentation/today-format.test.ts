import { createInstance } from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { sv } from '../../../i18n/locales/sv';
import { formatCompletedDuration, formatElapsed, formatLatest, formatTodayDate, localContextKey, millisecondsUntilLocalMidnight } from './today-format';
import { todayFixture } from './today-test-fixture';
const i18n = createInstance();
await i18n.init({ lng: 'sv', resources: { sv: { translation: sv } }, initAsync: false });
const { t } = i18n;
const day = todayFixture().day;
const zone = process.env.TZ;
afterEach(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });
describe('Today Swedish display values', () => {
  it('formats the captured local date', () => {
    expect(formatTodayDate(day)).toBe('onsdag 7 oktober 2026');
  });
  it.each([
    [null, 'Inget registrerat ännu'],
    ['2026-10-07T08:00:00Z', 'Idag kl. 10:00'],
    ['2026-10-06T08:00:00Z', 'Igår kl. 10:00'],
    ['2025-10-05T08:00:00Z', '5 okt. 2025 kl. 10:00'],
    ['2026-10-08T08:00:00Z', '8 okt. 2026 kl. 10:00'],
  ])('labels all-time latest %s', (epoch, expected) => {
    expect(formatLatest(epoch === null ? null : Date.parse(epoch), day, t)).toBe(expected);
  });
  it('compares civil days rather than 24-hour durations across DST', () => {
    const dst = { ...day, calendarDate: '2026-03-30' as typeof day.calendarDate };
    expect(formatLatest(Date.parse('2026-03-28T23:30:00Z'), dst, t)).toBe('Igår kl. 00:30');
  });
  it.each([[0, '0 min'], [1, 'Mindre än 1 min'], [60_000, '1 min'], [7_380_000, '2 tim 3 min']])(
    'formats completed sleep %i', (ms, expected) => expect(formatCompletedDuration(ms, t)).toBe(expected),
  );
  it('never formats negative timer values', () => {
    expect(formatElapsed(-1)).toBe('00:00:00');
    expect(formatElapsed(3_661_000)).toBe('01:01:01');
  });
  it('detects day, timezone and clock-offset changes', () => {
    process.env.TZ = 'UTC';
    const first = localContextKey(Date.parse('2026-10-07T23:59:59Z'));
    expect(localContextKey(Date.parse('2026-10-08T00:00:00Z'))).not.toBe(first);
    process.env.TZ = 'Europe/Stockholm';
    expect(localContextKey(Date.parse('2026-10-07T23:59:59Z'))).not.toBe(first);
  });
});

describe('Today local midnight scheduling', () => {
  it.each([
    ['2026-03-28T23:00:00Z', 23],
    ['2026-10-24T22:00:00Z', 25],
    ['2026-10-06T22:00:00Z', 24],
  ])('uses the calendar boundary at %s (%i hours)', (start, hours) => {
    process.env.TZ = 'Europe/Stockholm';
    expect(millisecondsUntilLocalMidnight(Date.parse(start))).toBe(hours * 3_600_000);
  });
});
