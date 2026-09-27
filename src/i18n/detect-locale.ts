import { getLocales, type Locale } from 'expo-localization';

import { fallbackLocale, supportedLocales, type SupportedLocale } from '@/i18n/config';

type LocaleCandidate = Pick<Locale, 'languageCode' | 'languageTag'>;

function matchSupportedLocale(candidate: LocaleCandidate): SupportedLocale | undefined {
  const languageCodes = [candidate.languageTag, candidate.languageCode]
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase().split('-')[0]);

  return supportedLocales.find((locale) => languageCodes.includes(locale));
}

export function detectLocale(locales: readonly LocaleCandidate[] = getLocales()): SupportedLocale {
  for (const locale of locales) {
    const supportedLocale = matchSupportedLocale(locale);

    if (supportedLocale) {
      return supportedLocale;
    }
  }

  return fallbackLocale;
}
