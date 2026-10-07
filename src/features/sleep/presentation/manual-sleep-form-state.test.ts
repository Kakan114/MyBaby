import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { sv } from '../../../i18n/locales/sv';

import {
  commitManualSleepDate,
  commitManualSleepTime,
  confirmManualSleepDate,
  confirmManualSleepTime,
  clearManualSleepPickerError,
  createEmptyManualSleepDraft,
  MANUAL_SLEEP_FUTURE_PICKER_ERROR_KEY,
  manualSleepBlurAction,
  manualSleepPickerErrorKey,
  manualSleepPickerMaximumDate,
} from './manual-sleep-form-state';

const translations = createInstance();
await translations.init({
  fallbackLng: 'sv',
  initAsync: false,
  lng: 'sv',
  resources: { sv: { translation: sv } },
});

describe('manual sleep form state', () => {
  it('starts with every persisted field explicitly unset', () => {
    expect(createEmptyManualSleepDraft()).toEqual({
      startDate: null,
      startTime: null,
      endDate: null,
      endTime: null,
      startOccurrence: null,
      endOccurrence: null,
    });
  });

  it('changes a field only after explicit picker confirmation', () => {
    const beforeOpeningPicker = createEmptyManualSleepDraft();
    const afterCancellingPicker = beforeOpeningPicker;
    expect(afterCancellingPicker).toBe(beforeOpeningPicker);

    const withDate = commitManualSleepDate(
      afterCancellingPicker,
      'start',
      { year: 2026, month: 10, day: 7 },
    );
    const withTime = commitManualSleepTime(withDate, 'start', { hour: 21, minute: 15 });
    expect(withTime).toMatchObject({
      startDate: { year: 2026, month: 10, day: 7 },
      startTime: { hour: 21, minute: 15 },
    });
  });

  it('clears only confirmed success on blur', () => {
    expect(manualSleepBlurAction('success')).toBe('reset');
    expect(manualSleepBlurAction('saving')).toBe('lock-uncertain');
    expect(manualSleepBlurAction('editing')).toBe('preserve');
    expect(manualSleepBlurAction('uncertain')).toBe('preserve');
  });

  it.each(['start', 'end'] as const)(
    'rejects tomorrow for the %s date while keeping today and past dates selectable',
    (endpoint) => {
      const empty = createEmptyManualSleepDraft();
      const now = { year: 2026, month: 10, day: 7, hour: 14, minute: 30 };
      const future = confirmManualSleepDate(
        empty, endpoint, { year: 2026, month: 10, day: 8 }, now,
      );
      expect(future).toEqual({ status: 'future', draft: empty });
      expect(confirmManualSleepDate(
        empty, endpoint, { year: 2026, month: 10, day: 7 }, now,
      ).status).toBe('accepted');
      expect(confirmManualSleepDate(
        empty, endpoint, { year: 2026, month: 10, day: 6 }, now,
      ).status).toBe('accepted');
    },
  );

  it('rejects a future time today without replacing the prior confirmed value', () => {
    const now = { year: 2026, month: 10, day: 7, hour: 14, minute: 30 };
    const withToday = commitManualSleepDate(
      createEmptyManualSleepDraft(), 'end', now,
    );
    const previous = commitManualSleepTime(withToday, 'end', { hour: 13, minute: 0 });
    expect(confirmManualSleepTime(
      previous, 'end', { hour: 15, minute: 0 }, now,
    )).toEqual({ status: 'future', draft: previous });
    expect(confirmManualSleepTime(
      withToday, 'end', { hour: 14, minute: 29 }, now,
    )).toMatchObject({
      status: 'accepted', draft: { endTime: { hour: 14, minute: 29 } },
    });
  });

  it('keeps an unset time unset after a rejected future selection', () => {
    const now = { year: 2026, month: 10, day: 7, hour: 14, minute: 30 };
    const withToday = commitManualSleepDate(
      createEmptyManualSleepDraft(), 'start', now,
    );
    expect(confirmManualSleepTime(
      withToday, 'start', { hour: 15, minute: 0 }, now,
    )).toEqual({ status: 'future', draft: withToday });
    expect(withToday.startTime).toBeNull();
  });

  it('resolves the picker error to Swedish and clears it after a valid choice or cancel', () => {
    const draft = createEmptyManualSleepDraft();
    const futureResult = { status: 'future' as const, draft };
    const acceptedResult = { status: 'accepted' as const, draft };
    const key = manualSleepPickerErrorKey(futureResult);
    expect(key).toBe(MANUAL_SLEEP_FUTURE_PICKER_ERROR_KEY);
    expect(translations.t(key!)).toBe('Du kan inte välja en tid i framtiden.');
    expect(translations.t(key!)).not.toBe(key);
    expect(manualSleepPickerErrorKey(acceptedResult)).toBeNull();
    expect(clearManualSleepPickerError()).toBeNull();
    expect(JSON.stringify(sv)).not.toContain('futurePicker');
  });

  it('keeps the native date maximum on local today and constrains only iOS time', () => {
    const openedAt = new Date(2026, 9, 7, 9, 37, 12, 345);
    const dateMaximum = manualSleepPickerMaximumDate('date', 'ios', openedAt)!;
    expect([
      dateMaximum.getFullYear(), dateMaximum.getMonth(), dateMaximum.getDate(),
      dateMaximum.getHours(), dateMaximum.getMinutes(),
    ]).toEqual([2026, 9, 7, 12, 0]);
    expect(manualSleepPickerMaximumDate('time', 'ios', openedAt)?.getTime())
      .toBe(openedAt.getTime());
    expect(manualSleepPickerMaximumDate('time', 'android', openedAt)).toBeUndefined();
  });

  it('allows any clock time on a previous date and preserves cross-midnight entry', () => {
    const now = { year: 2026, month: 10, day: 7, hour: 0, minute: 5 };
    let draft = createEmptyManualSleepDraft();
    draft = confirmManualSleepDate(
      draft, 'start', { year: 2026, month: 10, day: 5 }, now,
    ).draft;
    draft = confirmManualSleepTime(
      draft, 'start', { hour: 23, minute: 50 }, now,
    ).draft;
    draft = confirmManualSleepDate(
      draft, 'end', { year: 2026, month: 10, day: 6 }, now,
    ).draft;
    const result = confirmManualSleepTime(
      draft, 'end', { hour: 0, minute: 20 }, now,
    );
    expect(result).toMatchObject({
      status: 'accepted',
      draft: {
        startTime: { hour: 23, minute: 50 },
        endTime: { hour: 0, minute: 20 },
      },
    });
  });

  it('rejects choosing today when an already confirmed time would be in the future', () => {
    const now = { year: 2026, month: 10, day: 7, hour: 14, minute: 30 };
    const withFutureClockTime = commitManualSleepTime(
      createEmptyManualSleepDraft(), 'start', { hour: 15, minute: 0 },
    );
    expect(confirmManualSleepDate(
      withFutureClockTime, 'start', now, now,
    )).toEqual({ status: 'future', draft: withFutureClockTime });
  });
});
