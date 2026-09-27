# Localization

MyBaby uses `i18next`, `react-i18next`, and `expo-localization` for UI translations.

- Swedish (`sv`) is the only currently supported locale and is the fallback locale.
- Device locales are checked in preference order. Regional tags such as `sv-SE` match `sv`.
- `LanguagePreference` already models a future explicit locale or `system`, but persistence and the language settings UI are intentionally not implemented yet.
- Add a locale to `supportedLocales` only after its UI resources are complete.

This directory is only for interface copy. Medical and safety-critical knowledge content must use a separate controlled and versioned content system.
