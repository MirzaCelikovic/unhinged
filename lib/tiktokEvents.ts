import { Platform } from 'react-native';
import {
  TikTokBusiness,
  TikTokEventName,
  TikTokContentEventName,
  TikTokContentEventParameter,
} from 'react-native-tiktok-business-sdk';

// TikTok Business SDK is wired for iOS only (mirrors the reference doc).
const isSupported = () => Platform.OS === 'ios';

let initialized = false;

/**
 * Initialize the TikTok Business SDK. Safe to call once at app start.
 * Reads credentials from EXPO_PUBLIC_* env vars (inlined into the JS bundle).
 */
export const initTikTokSdk = async (): Promise<void> => {
  if (!isSupported() || initialized) return;

  const appId = process.env.EXPO_PUBLIC_APP_ID;
  const tiktokAppId = process.env.EXPO_PUBLIC_TIKTOK_APP_ID;
  const accessToken = process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN;

  if (!appId || !tiktokAppId || !accessToken) {
    console.warn(
      'TikTok SDK: missing EXPO_PUBLIC_APP_ID / TIKTOK_APP_ID / TIKTOK_ACCESS_TOKEN — skipping init'
    );
    return;
  }

  try {
    // react-native-skadnetwork owns SKAN conversion-value postbacks in this app,
    // so disable the TikTok SDK's built-in SKAN handling to stop the two from
    // racing on updatePostbackConversionValue (which clobbers conversion data).
    await TikTokBusiness.initializeSdk(appId, tiktokAppId, accessToken, false, {
      disableSKAdNetworkSupport: true,
    });
    initialized = true;
    console.log('TikTok SDK initialized');
  } catch (error) {
    console.error('TikTok SDK: Error initializing:', error);
  }
};

/** Standard `Registration` event (signup). */
export const logTikTokSignup = async (): Promise<void> => {
  if (!isSupported()) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.REGISTRATION);
  } catch (error) {
    console.error('TikTok Events: Error logging Registration event:', error);
  }
};

/** Standard `StartTrial` event. */
export const logTikTokTrialStarted = async (): Promise<void> => {
  if (!isSupported()) return;
  try {
    await TikTokBusiness.trackEvent(TikTokEventName.START_TRIAL);
  } catch (error) {
    console.error('TikTok Events: Error logging StartTrial event:', error);
  }
};

/**
 * Standard `Purchase` content event. In this SDK version Purchase is a
 * content event (TikTokContentEventName), not a plain TikTokEventName.
 */
export const logTikTokPurchase = async (productId?: string): Promise<void> => {
  if (!isSupported()) return;
  try {
    await TikTokBusiness.trackContentEvent(
      TikTokContentEventName.PURCHASE,
      productId ? { [TikTokContentEventParameter.CONTENT_ID]: productId } : undefined
    );
  } catch (error) {
    console.error('TikTok Events: Error logging Purchase event:', error);
  }
};
