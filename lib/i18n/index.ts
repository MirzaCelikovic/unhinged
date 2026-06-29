// i18n bootstrap (greenfield) — initialized once as a side-effect import from
// `app/_layout.tsx`. Adds infrastructure only: catalogs are still empty (`{}`),
// so the base `en` UI renders exactly as before until strings are extracted
// (Phase 2) and translated (Phase 3).
//
// Engine: i18next + react-i18next (see adapters/react-native.md). Device-locale
// detection via expo-localization. Components read translations through the
// `useTranslation('<ns>')` hook — no provider wrapper is required.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

// --- Static catalog imports (Metro-compatible) -----------------------------
// Metro cannot resolve dynamic/computed require paths, so every catalog is
// imported explicitly. Grouped per-locale to keep the 9×8 matrix readable; add
// a namespace = add one line per locale, add a locale = add one block.

// en (base)
import enCommon from './locales/en/common.json';
import enOnboarding from './locales/en/onboarding.json';
import enOnboardingV2 from './locales/en/onboardingV2.json';
import enHome from './locales/en/home.json';
import enTracking from './locales/en/tracking.json';
import enSettings from './locales/en/settings.json';
import enNav from './locales/en/nav.json';
import enInstagram from './locales/en/instagram.json';

// sv
import svCommon from './locales/sv/common.json';
import svOnboarding from './locales/sv/onboarding.json';
import svOnboardingV2 from './locales/sv/onboardingV2.json';
import svHome from './locales/sv/home.json';
import svTracking from './locales/sv/tracking.json';
import svSettings from './locales/sv/settings.json';
import svNav from './locales/sv/nav.json';
import svInstagram from './locales/sv/instagram.json';

// de
import deCommon from './locales/de/common.json';
import deOnboarding from './locales/de/onboarding.json';
import deOnboardingV2 from './locales/de/onboardingV2.json';
import deHome from './locales/de/home.json';
import deTracking from './locales/de/tracking.json';
import deSettings from './locales/de/settings.json';
import deNav from './locales/de/nav.json';
import deInstagram from './locales/de/instagram.json';

// fr
import frCommon from './locales/fr/common.json';
import frOnboarding from './locales/fr/onboarding.json';
import frOnboardingV2 from './locales/fr/onboardingV2.json';
import frHome from './locales/fr/home.json';
import frTracking from './locales/fr/tracking.json';
import frSettings from './locales/fr/settings.json';
import frNav from './locales/fr/nav.json';
import frInstagram from './locales/fr/instagram.json';

// es
import esCommon from './locales/es/common.json';
import esOnboarding from './locales/es/onboarding.json';
import esOnboardingV2 from './locales/es/onboardingV2.json';
import esHome from './locales/es/home.json';
import esTracking from './locales/es/tracking.json';
import esSettings from './locales/es/settings.json';
import esNav from './locales/es/nav.json';
import esInstagram from './locales/es/instagram.json';

// it
import itCommon from './locales/it/common.json';
import itOnboarding from './locales/it/onboarding.json';
import itOnboardingV2 from './locales/it/onboardingV2.json';
import itHome from './locales/it/home.json';
import itTracking from './locales/it/tracking.json';
import itSettings from './locales/it/settings.json';
import itNav from './locales/it/nav.json';
import itInstagram from './locales/it/instagram.json';

// ar (RTL)
import arCommon from './locales/ar/common.json';
import arOnboarding from './locales/ar/onboarding.json';
import arOnboardingV2 from './locales/ar/onboardingV2.json';
import arHome from './locales/ar/home.json';
import arTracking from './locales/ar/tracking.json';
import arSettings from './locales/ar/settings.json';
import arNav from './locales/ar/nav.json';
import arInstagram from './locales/ar/instagram.json';

// zh-Hans
import zhHansCommon from './locales/zh-Hans/common.json';
import zhHansOnboarding from './locales/zh-Hans/onboarding.json';
import zhHansOnboardingV2 from './locales/zh-Hans/onboardingV2.json';
import zhHansHome from './locales/zh-Hans/home.json';
import zhHansTracking from './locales/zh-Hans/tracking.json';
import zhHansSettings from './locales/zh-Hans/settings.json';
import zhHansNav from './locales/zh-Hans/nav.json';
import zhHansInstagram from './locales/zh-Hans/instagram.json';

// ja
import jaCommon from './locales/ja/common.json';
import jaOnboarding from './locales/ja/onboarding.json';
import jaOnboardingV2 from './locales/ja/onboardingV2.json';
import jaHome from './locales/ja/home.json';
import jaTracking from './locales/ja/tracking.json';
import jaSettings from './locales/ja/settings.json';
import jaNav from './locales/ja/nav.json';
import jaInstagram from './locales/ja/instagram.json';

// --- Supported locales -----------------------------------------------------
// Order is informational; `en` is the base + fallback.
export const SUPPORTED_LOCALES = [
  'en',
  'sv',
  'de',
  'fr',
  'es',
  'it',
  'ar',
  'zh-Hans',
  'ja',
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Namespaces, one per feature area. Pre-declared so parallel extraction work
// (Phase 2) never edits a shared registry.
export const NAMESPACES = [
  'common',
  'onboarding',
  'onboardingV2',
  'home',
  'tracking',
  'settings',
  'nav',
  'instagram',
] as const;

const DEFAULT_NS = 'common';

// Locales that render right-to-left.
const RTL_LOCALES = new Set(['ar', 'he', 'fa']);

// --- Resource assembly -----------------------------------------------------
// { [locale]: { [namespace]: catalog } } — the shape i18next expects.
const resources = {
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    onboardingV2: enOnboardingV2,
    home: enHome,
    tracking: enTracking,
    settings: enSettings,
    nav: enNav,
    instagram: enInstagram,
  },
  sv: {
    common: svCommon,
    onboarding: svOnboarding,
    onboardingV2: svOnboardingV2,
    home: svHome,
    tracking: svTracking,
    settings: svSettings,
    nav: svNav,
    instagram: svInstagram,
  },
  de: {
    common: deCommon,
    onboarding: deOnboarding,
    onboardingV2: deOnboardingV2,
    home: deHome,
    tracking: deTracking,
    settings: deSettings,
    nav: deNav,
    instagram: deInstagram,
  },
  fr: {
    common: frCommon,
    onboarding: frOnboarding,
    onboardingV2: frOnboardingV2,
    home: frHome,
    tracking: frTracking,
    settings: frSettings,
    nav: frNav,
    instagram: frInstagram,
  },
  es: {
    common: esCommon,
    onboarding: esOnboarding,
    onboardingV2: esOnboardingV2,
    home: esHome,
    tracking: esTracking,
    settings: esSettings,
    nav: esNav,
    instagram: esInstagram,
  },
  it: {
    common: itCommon,
    onboarding: itOnboarding,
    onboardingV2: itOnboardingV2,
    home: itHome,
    tracking: itTracking,
    settings: itSettings,
    nav: itNav,
    instagram: itInstagram,
  },
  ar: {
    common: arCommon,
    onboarding: arOnboarding,
    onboardingV2: arOnboardingV2,
    home: arHome,
    tracking: arTracking,
    settings: arSettings,
    nav: arNav,
    instagram: arInstagram,
  },
  'zh-Hans': {
    common: zhHansCommon,
    onboarding: zhHansOnboarding,
    onboardingV2: zhHansOnboardingV2,
    home: zhHansHome,
    tracking: zhHansTracking,
    settings: zhHansSettings,
    nav: zhHansNav,
    instagram: zhHansInstagram,
  },
  ja: {
    common: jaCommon,
    onboarding: jaOnboarding,
    onboardingV2: jaOnboardingV2,
    home: jaHome,
    tracking: jaTracking,
    settings: jaSettings,
    nav: jaNav,
    instagram: jaInstagram,
  },
} as const;

// --- Device locale ---------------------------------------------------------
// expo-localization `getLocales()[0].languageCode` is the bare code ("en",
// "zh", "ar"). Our supported set keys on "zh-Hans", so map script-bearing
// codes, then fall back to `en` for anything unsupported.
function resolveDeviceLocale(): SupportedLocale {
  const first = getLocales()[0];
  const languageCode = first?.languageCode ?? 'en'; // e.g. "en", "zh", "ar"
  const languageTag = first?.languageTag ?? ''; // e.g. "en-US", "zh-Hans-CN"

  // Chinese: distinguish Simplified (the only variant we ship) from others.
  if (languageCode === 'zh') {
    return languageTag.includes('Hant') ? 'en' : 'zh-Hans';
  }

  return (SUPPORTED_LOCALES as readonly string[]).includes(languageCode)
    ? (languageCode as SupportedLocale)
    : 'en';
}

// --- RTL --------------------------------------------------------------------
// On native, RTL is a process-level flag (NOT CSS dir="rtl"). forceRTL only
// takes full effect after an app reload, so we flip the flag here and trigger a
// one-time reload. expo-updates is optional — guard the require so a missing
// module never crashes startup; in that case the user must relaunch manually
// for layout mirroring to apply.
export function applyRTL(locale: string) {
  const shouldBeRTL = RTL_LOCALES.has(locale);
  if (I18nManager.isRTL === shouldBeRTL) return;

  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);

  // Reload so the new layout direction takes hold. expo-updates may not be
  // installed (it isn't a dependency here) — fail soft.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates');
    if (Updates?.reloadAsync) {
      // Fire-and-forget; reload tears down the JS context anyway.
      Updates.reloadAsync().catch(() => {
        /* dev client / no OTA — relaunch required */
      });
    }
  } catch {
    // expo-updates absent (e.g. dev build) — full mirroring applies on next
    // manual relaunch. Text + logical props still render correctly meanwhile.
  }
}

// --- Init -------------------------------------------------------------------
const deviceLocale = resolveDeviceLocale();

// Set RTL before first render so layout direction is correct from the start.
applyRTL(deviceLocale);

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLocale,
  fallbackLng: 'en',
  ns: [...NAMESPACES],
  defaultNS: DEFAULT_NS,
  compatibilityJSON: 'v4', // REQUIRED: CLDR plural categories (few/many/zero/…).
  interpolation: { escapeValue: false }, // React already escapes; RN has no XSS surface.
});

export default i18n;
