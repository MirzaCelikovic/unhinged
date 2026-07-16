import { MMKV } from 'react-native-mmkv';

// Lightweight synchronous key-value store used to dedupe one-shot
// attribution postbacks (install / signup / purchase) so each SKAN
// conversion-value update fires at most once per device install.
export const storage = new MMKV();

const KEYS = {
  SKAN_TRACKED_SUBSCRIPTIONS: 'skan_tracked_subscriptions',
  SKAN_INSTALL_TRACKED: 'skan_install_tracked',
  SKAN_SIGNUP_TRACKED: 'skan_signup_tracked',
  TRACKED_SUBSCRIPTION_CONVERSIONS: 'tracked_subscription_conversions',
  AGE_GROUP: 'age_group',
  HARD_PAYWALL_VARIANT: 'hard_paywall_variant',
  HARD_PAYWALL_STAMPED_AT: 'hard_paywall_stamped_at',
  ONBOARDING_PROGRESS: 'onboarding_progress',
} as const;

// --- SKAN install dedupe ---
export const hasSkanTrackedInstall = (): boolean => {
  return storage.getBoolean(KEYS.SKAN_INSTALL_TRACKED) ?? false;
};
export const setSkanInstallTracked = () => {
  storage.set(KEYS.SKAN_INSTALL_TRACKED, true);
};

// --- SKAN signup dedupe ---
// INSTAGRAM_CONNECTED fires on every connect (incl. reconnects / account
// switches), so the signup postback is deduped to once per install.
export const hasSkanTrackedSignup = (): boolean => {
  return storage.getBoolean(KEYS.SKAN_SIGNUP_TRACKED) ?? false;
};
export const setSkanTrackedSignup = () => {
  storage.set(KEYS.SKAN_SIGNUP_TRACKED, true);
};

// --- SKAN purchase dedupe (per subscription id) ---
export const getSkanTrackedSubscriptions = (): string[] => {
  const data = storage.getString(KEYS.SKAN_TRACKED_SUBSCRIPTIONS);
  return data ? JSON.parse(data) : [];
};
export const addSkanTrackedSubscription = (subscriptionId: string) => {
  const tracked = getSkanTrackedSubscriptions();
  if (!tracked.includes(subscriptionId)) {
    tracked.push(subscriptionId);
    storage.set(KEYS.SKAN_TRACKED_SUBSCRIPTIONS, JSON.stringify(tracked));
  }
};
export const hasSkanTrackedSubscription = (subscriptionId: string): boolean => {
  return getSkanTrackedSubscriptions().includes(subscriptionId);
};

// --- Age group (COM-6: customized pricing per age group) ---
// Captured once during onboarding and read synchronously when presenting the
// paywall, to select the age-specific RevenueCat offering. MMKV (not
// AsyncStorage) is used precisely because the paywall read must be synchronous.
export type AgeGroup = '18_24' | '25_34' | '35_plus';

export const getAgeGroup = (): AgeGroup | null => {
  return (storage.getString(KEYS.AGE_GROUP) as AgeGroup | undefined) ?? null;
};
export const setAgeGroup = (ageGroup: AgeGroup) => {
  storage.set(KEYS.AGE_GROUP, ageGroup);
};

// --- Cross-SDK purchase dedupe (safety-net check) ---
export const hasTrackedConversion = (subscriptionId: string): boolean => {
  const data = storage.getString(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS);
  const tracked: string[] = data ? JSON.parse(data) : [];
  return tracked.includes(subscriptionId);
};
export const addTrackedConversion = (subscriptionId: string) => {
  const data = storage.getString(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS);
  const tracked: string[] = data ? JSON.parse(data) : [];
  if (!tracked.includes(subscriptionId)) {
    tracked.push(subscriptionId);
    storage.set(KEYS.TRACKED_SUBSCRIPTION_CONVERSIONS, JSON.stringify(tracked));
  }
};

// --- Hard-paywall A/B (COM-38) ---
// The experiment ARM the user was assigned, recorded once AT THE ONBOARDING GATE
// (the moment of exposure) for analytics attribution. The runtime gate keys on the
// LIVE offering metadata (see lib/hardPaywall.ts), not this — this only labels the
// user for the readout so the arm survives across sessions and post-purchase.
//
// The timestamp exists because the app cannot tell "control arm" apart from
// "experiment not running" — both are simply served the control offering. Filtering
// Amplitude to users stamped after the experiment start date keeps the control arm
// from being polluted by users who onboarded while the build was still dormant.
export type HardPaywallVariant = 'hard' | 'control';

export const getHardPaywallVariant = (): HardPaywallVariant | null => {
  return (storage.getString(KEYS.HARD_PAYWALL_VARIANT) as HardPaywallVariant | undefined) ?? null;
};
export const getHardPaywallStampedAt = (): string | null => {
  return storage.getString(KEYS.HARD_PAYWALL_STAMPED_AT) ?? null;
};
export const setHardPaywallVariant = (variant: HardPaywallVariant) => {
  storage.set(KEYS.HARD_PAYWALL_VARIANT, variant);
  storage.set(KEYS.HARD_PAYWALL_STAMPED_AT, new Date().toISOString());
};

// --- Onboarding progress (COM-38) ---
// Persist the v2 onboarding step + answers so a user who backgrounds/relaunches
// mid-onboarding resumes where they left off instead of re-doing the whole quiz.
// Shipped for BOTH arms as a neutral change (keeps the A/B difference to
// dismissibility only). Cleared on completion.
export interface OnboardingProgress {
  step: number;
  answers: Record<string, string>;
  trackProfile: unknown | null;
}

export const getOnboardingProgress = (): OnboardingProgress | null => {
  const data = storage.getString(KEYS.ONBOARDING_PROGRESS);
  if (!data) return null;
  try {
    return JSON.parse(data) as OnboardingProgress;
  } catch {
    return null;
  }
};
export const setOnboardingProgress = (progress: OnboardingProgress) => {
  storage.set(KEYS.ONBOARDING_PROGRESS, JSON.stringify(progress));
};
export const clearOnboardingProgress = () => {
  storage.delete(KEYS.ONBOARDING_PROGRESS);
};
