import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from '../locales/en.json';
import de from '../locales/de.json';

const deviceLocale = getLocales()[0]?.languageTag ?? 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: deviceLocale,
  fallbackLng: 'en',
  load: 'languageOnly',
  keySeparator: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
