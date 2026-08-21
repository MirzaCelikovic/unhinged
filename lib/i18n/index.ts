import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import de from './locales/de.json';

export const defaultLocale = 'en';
export const supportedLocales = ['en', 'de'] as const;

const resources = {
  en: { translation: en },
  de: { translation: de },
};

const deviceLocale =
  Localization.getLocales().find((locale) =>
    supportedLocales.includes(locale.languageCode as (typeof supportedLocales)[number])
  )?.languageCode ?? defaultLocale;

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLocale,
  fallbackLng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
