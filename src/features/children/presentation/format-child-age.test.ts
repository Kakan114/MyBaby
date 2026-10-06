import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { sv } from '../../../i18n/locales/sv';
import { getChildAge } from '../domain/age';
import { createCalendarDate } from '../domain/calendar-date';
import { formatChildAge } from './format-child-age';

const i18n = createInstance();
await i18n.init({
  lng: 'sv',
  resources: { sv: { translation: sv } },
  initAsync: false,
  interpolation: { escapeValue: false },
});

describe('Swedish child age from calendar dates', () => {
  it.each([
    ['2025-01-01', '2025-01-01', '0 dagar gammal'],
    ['2025-01-01', '2025-01-02', '1 dag gammal'],
    ['2025-01-01', '2025-01-07', '6 dagar gammal'],
    ['2025-01-01', '2025-01-14', '13 dagar gammal'],
    ['2025-01-01', '2025-01-15', '2 veckor'],
    ['2025-01-01', '2025-01-26', '3 veckor och 4 dagar'],
    ['2025-01-01', '2025-02-18', '6 veckor och 6 dagar'],
    ['2025-01-01', '2025-02-19', '7 veckor'],
    ['2025-01-01', '2025-02-25', '7 veckor och 6 dagar'],
    ['2025-01-01', '2025-02-26', '8 veckor'],
    ['2025-01-01', '2025-02-28', '8 veckor och 2 dagar'],
    ['2025-01-01', '2025-03-01', '2 månader'],
    ['2025-01-01', '2025-03-04', '2 månader och 3 dagar'],
    ['2025-01-01', '2025-03-02', '2 månader och 1 dag'],
    ['2025-01-01', '2025-08-13', '7 månader och 12 dagar'],
    ['2025-01-31', '2025-02-28', '4 veckor'],
    ['2025-01-31', '2025-03-30', '8 veckor och 2 dagar'],
    ['2025-01-31', '2025-03-31', '2 månader'],
    ['2025-01-31', '2025-04-01', '2 månader och 1 dag'],
    ['2025-01-31', '2025-04-30', '3 månader'],
    ['2025-01-31', '2025-05-01', '3 månader och 1 dag'],
    ['2024-01-31', '2024-02-29', '4 veckor och 1 dag'],
    ['2024-01-31', '2024-03-31', '2 månader'],
    ['2024-02-29', '2024-03-01', '1 dag gammal'],
    ['2024-02-29', '2024-04-28', '8 veckor och 3 dagar'],
    ['2024-02-29', '2024-04-29', '2 månader'],
    ['2024-02-29', '2024-05-01', '2 månader och 2 dagar'],
    ['2024-02-29', '2025-02-27', '11 månader och 29 dagar'],
    ['2024-02-29', '2025-02-28', '1 år'],
    ['2024-02-29', '2025-03-01', '1 år'],
    ['2024-02-29', '2025-04-28', '1 år och 2 månader'],
    ['2025-01-01', '2026-01-01', '1 år'],
    ['2025-01-01', '2026-03-01', '1 år och 2 månader'],
    ['2023-01-01', '2025-08-13', '2 år och 7 månader'],
  ])('%s through %s → %s', (birth, asOf, expected) => {
    const age = getChildAge(createCalendarDate(birth), createCalendarDate(asOf));
    expect(formatChildAge(age, i18n.t)).toBe(expected);
  });
});
