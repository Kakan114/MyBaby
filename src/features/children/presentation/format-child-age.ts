import type { TFunction } from 'i18next';

import type { ChildAge } from '../domain/age';

export function formatChildAge(age: ChildAge, t: TFunction): string {
  const months = t('children.age.months', { count: age.months });

  if (age.years > 0) {
    const years = t('children.age.years', { count: age.years });
    return age.months === 0
      ? years
      : t('children.age.yearsAndMonths', { years, months });
  }

  // Calendar-month anniversaries take priority over elapsed week counts.
  if (age.months >= 2) {
    return age.days === 0
      ? months
      : t('children.age.monthsAndDays', {
          months,
          days: t('children.age.days', { count: age.days }),
        });
  }

  if (age.fullDays < 14) {
    return t('children.age.daysOld', { count: age.fullDays });
  }

  const weeks = t('children.age.weeks', { count: age.fullWeeks });
  return age.remainingWeekDays === 0
    ? weeks
    : t('children.age.weeksAndDays', {
        weeks,
        days: t('children.age.days', { count: age.remainingWeekDays }),
      });
}
