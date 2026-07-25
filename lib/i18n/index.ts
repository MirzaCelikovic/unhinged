import i18n from 'i18next';
import { getLocales } from 'expo-localization';
import { initReactI18next } from 'react-i18next';

// RTL guard runs before init so the native direction flag is set before first render.
import { applyRTL } from './rtl';

// Resources are assembled as N locales × M namespaces. Metro cannot resolve dynamic /
// computed require paths, so every <locale>/<ns>.json is imported statically and
// zipped into { [locale]: { [ns]: catalog } } below. (These start as empty {} and are
// filled by the extractor + translator passes.)

// en (source)
import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import enStart from './locales/en/start.json';
import enHome from './locales/en/home.json';
import enTracking from './locales/en/tracking.json';
import enSettings from './locales/en/settings.json';
import enOnboarding from './locales/en/onboarding.json';
import enOnboardingV2 from './locales/en/onboardingV2.json';

// de
import deCommon from './locales/de/common.json';
import deNav from './locales/de/nav.json';
import deStart from './locales/de/start.json';
import deHome from './locales/de/home.json';
import deTracking from './locales/de/tracking.json';
import deSettings from './locales/de/settings.json';
import deOnboarding from './locales/de/onboarding.json';
import deOnboardingV2 from './locales/de/onboardingV2.json';

// fr
import frCommon from './locales/fr/common.json';
import frNav from './locales/fr/nav.json';
import frStart from './locales/fr/start.json';
import frHome from './locales/fr/home.json';
import frTracking from './locales/fr/tracking.json';
import frSettings from './locales/fr/settings.json';
import frOnboarding from './locales/fr/onboarding.json';
import frOnboardingV2 from './locales/fr/onboardingV2.json';

// ar (RTL)
import arCommon from './locales/ar/common.json';
import arNav from './locales/ar/nav.json';
import arStart from './locales/ar/start.json';
import arHome from './locales/ar/home.json';
import arTracking from './locales/ar/tracking.json';
import arSettings from './locales/ar/settings.json';
import arOnboarding from './locales/ar/onboarding.json';
import arOnboardingV2 from './locales/ar/onboardingV2.json';

// ja
import jaCommon from './locales/ja/common.json';
import jaNav from './locales/ja/nav.json';
import jaStart from './locales/ja/start.json';
import jaHome from './locales/ja/home.json';
import jaTracking from './locales/ja/tracking.json';
import jaSettings from './locales/ja/settings.json';
import jaOnboarding from './locales/ja/onboarding.json';
import jaOnboardingV2 from './locales/ja/onboardingV2.json';

// One namespace per feature area. Keep in sync with the locale folders and with any
// useTranslation('<ns>') callsite added by the extractor pass.
export const NS = [
  'nav',
  'start',
  'home',
  'tracking',
  'settings',
  'onboarding',
  'onboardingV2',
  'common',
] as const;

export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'ar', 'ja'] as const;

const resources = {
  en: {
    nav: enNav,
    start: enStart,
    home: enHome,
    tracking: enTracking,
    settings: enSettings,
    onboarding: enOnboarding,
    onboardingV2: enOnboardingV2,
    common: enCommon,
  },
  de: {
    nav: deNav,
    start: deStart,
    home: deHome,
    tracking: deTracking,
    settings: deSettings,
    onboarding: deOnboarding,
    onboardingV2: deOnboardingV2,
    common: deCommon,
  },
  fr: {
    nav: frNav,
    start: frStart,
    home: frHome,
    tracking: frTracking,
    settings: frSettings,
    onboarding: frOnboarding,
    onboardingV2: frOnboardingV2,
    common: frCommon,
  },
  ar: {
    nav: arNav,
    start: arStart,
    home: arHome,
    tracking: arTracking,
    settings: arSettings,
    onboarding: arOnboarding,
    onboardingV2: arOnboardingV2,
    common: arCommon,
  },
  ja: {
    nav: jaNav,
    start: jaStart,
    home: jaHome,
    tracking: jaTracking,
    settings: jaSettings,
    onboarding: jaOnboarding,
    onboardingV2: jaOnboardingV2,
    common: jaCommon,
  },
} as const;

// Device locale is script-less: expo-localization returns the bare code (`ar`, `ja`).
// Fall back to `en` for anything outside the supported set.
const deviceCode = getLocales()[0]?.languageCode ?? 'en';
const resolved = (SUPPORTED_LOCALES as readonly string[]).includes(deviceCode)
  ? deviceCode
  : 'en';

// Set the RTL flag before i18next initialises / first render.
applyRTL(resolved);

i18n.use(initReactI18next).init({
  resources,
  lng: resolved,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LOCALES],
  ns: [...NS],
  defaultNS: 'common',
  compatibilityJSON: 'v4', // REQUIRED for correct CLDR plural categories (ar few/many/…)
  interpolation: { escapeValue: false }, // RN has no XSS; React escapes anyway
  react: { useSuspense: false }, // no <Suspense> boundary in this app
});

export default i18n;
