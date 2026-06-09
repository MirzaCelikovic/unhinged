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
