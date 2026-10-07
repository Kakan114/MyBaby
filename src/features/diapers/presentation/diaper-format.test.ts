import { describe, expect, it } from 'vitest';
import { formatDiaperClock, formatDiaperDateHeading, groupDiapersByLocalDate } from './diaper-format';

describe('diaper history formatting', () => {
  it('groups ordered events by local day', () => {
    const first = new Date(2026, 9, 7, 14, 32).getTime();
    const second = new Date(2026, 9, 6, 23, 59).getTime();
    const groups = groupDiapersByLocalDate([
      { id: 'a', childId: 'c', occurredAtEpochMs: first, kind: 'wet' },
      { id: 'b', childId: 'c', occurredAtEpochMs: second, kind: 'dirty' },
    ]);
    expect(groups).toHaveLength(2);
    expect(formatDiaperClock(first)).toBe('14:32');
    expect(formatDiaperDateHeading(first, first, { today: 'Idag', yesterday: 'Igår' })).toBe('Idag');
    expect(formatDiaperDateHeading(second, first, { today: 'Idag', yesterday: 'Igår' })).toBe('Igår');
  });
});
