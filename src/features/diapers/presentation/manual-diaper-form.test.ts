import { describe, expect, it } from 'vitest';
import {
  confirmDiaperDate,
  confirmDiaperTime,
  diaperPickerMaximumDate,
  emptyManualDiaperDraft,
  manualDiaperDraftFromEvent,
  resolveEditedDiaperTimestamp,
  resolveManualDiaperInstant,
} from './manual-diaper-form';

const now = { year: 2026, month: 10, day: 7, hour: 12, minute: 0 };

describe('manual diaper form', () => {
  it('requires explicit fields and prevents future picker values without replacing prior values', () => {
    expect(resolveManualDiaperInstant(emptyManualDiaperDraft)).toEqual({ status: 'incomplete' });
    expect(confirmDiaperDate(emptyManualDiaperDraft, { year: 2026, month: 10, day: 8 }, now))
      .toEqual({ status: 'future', draft: emptyManualDiaperDraft });
    const dated = confirmDiaperDate(emptyManualDiaperDraft, { year: 2026, month: 10, day: 7 }, now).draft;
    expect(confirmDiaperTime(dated, { hour: 12, minute: 1 }, now)).toEqual({ status: 'future', draft: dated });
    expect(confirmDiaperTime(dated, { hour: 11, minute: 59 }, now).status).toBe('accepted');
  });

  it('accepts past-day times and resolves a unique local instant', () => {
    let draft = confirmDiaperDate(emptyManualDiaperDraft, { year: 2026, month: 10, day: 6 }, now).draft;
    draft = confirmDiaperTime(draft, { hour: 23, minute: 59 }, now).draft;
    expect(resolveManualDiaperInstant({ ...draft, kind: 'mixed' })).toMatchObject({ status: 'valid' });
  });

  it('bounds the Android calendar picker to local today using UTC-midnight semantics', () => {
    const openedAt = new Date(2026, 9, 7, 12, 0);
    expect(diaperPickerMaximumDate('date', 'android', openedAt)?.getTime())
      .toBe(Date.UTC(2026, 9, 7));
    expect(diaperPickerMaximumDate('time', 'android', openedAt)).toBeUndefined();
    expect(diaperPickerMaximumDate('time', 'ios', openedAt)?.getTime()).toBe(openedAt.getTime());
  });

  it('prefills edit values from the canonical event without mutating its identity', () => {
    const occurredAtEpochMs = new Date(2026, 9, 6, 11, 42, 37).getTime();
    const event = { id: 'event', childId: 'child', occurredAtEpochMs, kind: 'dirty' as const };
    expect(manualDiaperDraftFromEvent(event)).toMatchObject({
      kind: 'dirty',
      date: { year: 2026, month: 10, day: 6 },
      time: { hour: 11, minute: 42 },
    });
    expect(event).toEqual({ id: 'event', childId: 'child', occurredAtEpochMs, kind: 'dirty' });
  });

  it('preserves exact seconds for kind-only edits and accepts an explicitly changed minute', () => {
    const original = new Date(2026, 9, 6, 11, 42, 37, 456).getTime();
    const sameDisplayedMinute = new Date(2026, 9, 6, 11, 42, 0, 0).getTime();
    const changedMinute = new Date(2026, 9, 6, 11, 43, 0, 0).getTime();
    expect(resolveEditedDiaperTimestamp(original, sameDisplayedMinute)).toBe(original);
    expect(resolveEditedDiaperTimestamp(original, changedMinute)).toBe(changedMinute);
  });
});
