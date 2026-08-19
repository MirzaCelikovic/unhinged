// i18next initialization for Unhinged.
//
// Detects the device locale via expo-localization and initializes i18next once
// at app startup, falling back to the source locale (English) when the device
// locale is not one of the configured locales.
//
// Locale resources live in `locales/<locale>.json`. English is the source of
// truth; the committed trust tests (lib/i18n.test.ts) keep every locale file
// key-complete and placeholder-consistent with it.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from '../locales/en.json';
import de from '../locales/de.json';
import fr from '../locales/fr.json';
import ar from '../locales/ar.json';
import ja from '../locales/ja.json';

export const SOURCE_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'ar', 'ja'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const resources = {
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  ar: { translation: ar },
  ja: { translation: ja },
} as const;

// Resolve the best-matching configured locale from the device's preferred
// languages, falling back to the source locale.
function detectLocale(): SupportedLocale {
  const supported = SUPPORTED_LOCALES as readonly string[];
  for (const locale of getLocales()) {
    const tag = locale.languageTag?.toLowerCase() ?? '';
    const code = locale.languageCode?.toLowerCase() ?? '';
    const match = SUPPORTED_LOCALES.find((l) => tag === l || tag.startsWith(`${l}-`) || code === l);
    if (match) return match;
  }
  return SOURCE_LOCALE;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: detectLocale(),
    fallbackLng: SOURCE_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;
