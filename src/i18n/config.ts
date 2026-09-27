export const supportedLocales = ['sv'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type LanguagePreference = 'system' | SupportedLocale;

export const fallbackLocale: SupportedLocale = 'sv';
export const defaultNamespace = 'translation' as const;
