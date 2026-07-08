import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import de from './locales/de.json';

export const resources = {
  en: { translation: en },
  de: { translation: de },
} as const;

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export const FALLBACK_LOCALE = 'en';

/**
 * Resolve the best-matching supported locale from the device's preferred
 * languages, falling back to the source locale when none is available.
 */
function resolveDeviceLocale(): string {
  const locales = getLocales();
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase();
    if (code && (SUPPORTED_LOCALES as readonly string[]).includes(code)) {
      return code;
    }
  }
  return FALLBACK_LOCALE;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: resolveDeviceLocale(),
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
