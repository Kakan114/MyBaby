import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { defaultNamespace, fallbackLocale, supportedLocales } from '@/i18n/config';
import { detectLocale } from '@/i18n/detect-locale';
import { resources } from '@/i18n/resources';

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    defaultNS: defaultNamespace,
    fallbackLng: fallbackLocale,
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    lng: detectLocale(),
    resources,
    supportedLngs: [...supportedLocales],
  });
}

export { i18n };
