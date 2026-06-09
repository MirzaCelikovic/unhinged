import { Platform } from 'react-native';
import { logEventSKAdNetwork } from 'react-native-skadnetwork';

import {
  addSkanTrackedSubscription,
  hasSkanTrackedInstall,
  hasSkanTrackedSignup,
  hasSkanTrackedSubscription,
  setSkanInstallTracked,
  setSkanTrackedSignup,
} from './storage';

// Encoding: each event sets one bit; SKAN fine value = 2^event.
// INSTALL -> fine value 1, SIGNUP -> 2, PURCHASE -> 4.
// Up to 6 events fit in the 6-bit fine value (0..63).
export const SKAdNetworkEvents = {
  INSTALL: 0,
  SIGNUP: 1,
  PURCHASE: 2,
} as const;
export type SKAdNetworkEvent = (typeof SKAdNetworkEvents)[keyof typeof SKAdNetworkEvents];

const logEvent = async (
  event: SKAdNetworkEvent,
  coarseValue: number = 0, // 0 = Low, 1 = Medium, 2 = High (iOS 16.1+)
  lockWindow: boolean = false // iOS 16.1+ - true ends the conversion window immediately
): Promise<void> => {
  if (Platform.OS !== 'ios') return;
  try {
    await logEventSKAdNetwork(event, coarseValue, lockWindow);
    console.log(`SKAdNetwork: Successfully logged event ${event}`);
  } catch (error) {
    console.error('SKAdNetwork: Error logging event:', error);
  }
};

// Only emit the install postback once per device install. This is what kicks
// off the SKAN attribution window (registers the install with SKAdNetwork).
export const trackInstallIfNeeded = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (!hasSkanTrackedInstall()) {
    logEvent(SKAdNetworkEvents.INSTALL);
    setSkanInstallTracked();
    return true;
  }
  return false;
};

// Only emit the signup postback once per device install.
export const trackSignupIfNeeded = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (!hasSkanTrackedSignup()) {
    logEvent(SKAdNetworkEvents.SIGNUP);
    setSkanTrackedSignup();
    return true;
  }
  return false;
};

// Only emit the purchase postback once per subscription id.
export const trackPurchaseIfNeeded = (subscriptionId: string): boolean => {
  if (Platform.OS !== 'ios') return false;
  if (!hasSkanTrackedSubscription(subscriptionId)) {
    logEvent(SKAdNetworkEvents.PURCHASE);
    addSkanTrackedSubscription(subscriptionId);
    return true;
  }
  return false;
};
