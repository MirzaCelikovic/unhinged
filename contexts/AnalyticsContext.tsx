import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as amplitude from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { Experiment, ExperimentClient } from '@amplitude/experiment-js-client';
import { CustomerIO } from 'customerio-reactnative';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';
import Purchases from 'react-native-purchases';
import { initTikTokSdk, logTikTokPurchase, logTikTokSignup } from '~/lib/tiktokEvents';
import {
  trackInstallIfNeeded,
  trackPurchaseIfNeeded,
  trackSignupIfNeeded,
} from '~/lib/skadNetwork';

export const Events = {
  START_SCREEN_VIEWED: 'Start Screen Viewed',
  ONBOARDING_STARTED: 'Onboarding Started',
  HDYHAU_COMPLETED: 'Hdyhau Completed',
  HCWH_COMPLETED: 'Hcwh Completed',
  USERNAME_SEARCH_COMPLETED: 'Username Search Completed',
  USERNAME_SEARCH_SKIPPED: 'Username Search Skipped',
  USERNAME_RESULT_COMPLETED: 'Username Result Completed',
  TRACK_SEARCH_COMPLETED: 'Track Search Completed',
  TRACK_SEARCH_SKIPPED: 'Track Search Skipped',
  TRACK_RESULT_COMPLETED: 'Track Result Completed',
  HWH1_COMPLETED: 'Hwh1 Completed',
  HWH2_COMPLETED: 'Hwh2 Completed',
  NOTIFICATIONS_ACTIVATED: 'Notifications Activated',
  REVIEW_COMPLETED: 'Review Completed',
  STATS_COMPLETED: 'Stats Completed',
  COMPARISON_COMPLETED: 'Comparison Completed',
  WHO_COMPLETED: 'Who Completed',
  ALARM_BELLS_COMPLETED: 'Alarm Bells Completed',
  AGE_SELECTED: 'Age Selected',
  ANALYZING_COMPLETED: 'Analyzing Completed',
  REVEAL_VIEWED: 'Reveal Viewed',
  REVEAL_PAYWALL_TRIGGERED: 'Reveal Paywall Triggered',
  REVEAL_MAYBE_LATER: 'Reveal Maybe Later',
  REVEAL_SUBSCRIBED: 'Reveal Subscribed',
  INSTAGRAM_CONNECTED_ONBOARDING: 'Instagram Connected Onboarding',
  INSTAGRAM_CONNECTED: 'Instagram Connected',
  ACCOUNT_TRACKED: 'Account Tracked',
  HOME_SCREEN_VIEWED: 'Home Screen Viewed',
  TRACKING_SCREEN_VIEWED: 'Tracking Screen Viewed',
  SETTINGS_SCREEN_VIEWED: 'Settings Screen Viewed',
  PAYWALL_VIEWED: 'Paywall Viewed',
  PAYWALL_CLOSED: 'Paywall Closed',
  PURCHASE: 'Purchase',
  SYNC_METRICS_REPORTED: 'Sync Metrics Reported',
  SYNC_PUSHBACK_DETECTED: 'Sync Pushback Detected',
  SYNC_FETCH_ERROR: 'Sync Fetch Error',
} as const;

// TikTok / SKAdNetwork attribution is dispatched from this same chokepoint so it
// fires at exactly the same moments as the corresponding Amplitude events.
// (iOS-only; all underlying calls early-return on other platforms.)
const dispatchAttribution = (event: string, properties?: Record<string, any>) => {
  switch (event) {
    case Events.INSTAGRAM_CONNECTED:
      logTikTokSignup(); // TikTok 'Registration'
      trackSignupIfNeeded(); // SKAN signup postback (fineValue 2), deduped per install
      break;
    case Events.PURCHASE:
      logTikTokPurchase(properties?.product); // TikTok 'Purchase' content event
      // SKAN purchase postback (fineValue 4), deduped per product id
      trackPurchaseIfNeeded(String(properties?.product ?? 'purchase'));
      break;
  }
};

// Standalone functions that can be called without hooks (to avoid circular deps)
export const analytics = {
  track: (event: string, properties?: Record<string, any>) => {
    amplitude.track(event, properties);
    CustomerIO.track(event, properties);
    dispatchAttribution(event, properties);
  },
  identify: (userId: string) => {
    amplitude.setUserId(userId);
  },
};

interface AnalyticsContextType {
  track: (event: string, properties?: Record<string, any>) => void;
  identify: (userId: string) => void;
  getVariant: (flagKey: string) => string | undefined;
  experimentsReady: boolean;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within AnalyticsProvider');
  }
  return context;
};

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const isInitialized = useRef(false);
  const experimentClientRef = useRef<ExperimentClient | null>(null);
  const [experimentsReady, setExperimentsReady] = useState(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const initAnalytics = async () => {
      try {
        // 1) Request ATT FIRST — before any Meta SDK calls
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { status } = await requestTrackingPermissionsAsync();
        console.log('ATT permission status:', status);
        const granted = status === 'granted';

        // 2) Initialize Meta SDK with ATT status already known
        Settings.initializeSDK();
        Settings.setAdvertiserTrackingEnabled(granted);
        Settings.setAdvertiserIDCollectionEnabled(granted);

        // 3) Enable auto-log AFTER ATT — triggers app activation with IDFA if granted
        Settings.setAutoLogAppEventsEnabled(true);

        // 4) RevenueCat attribution (after ATT so IDFA is available)
        const anonymousId = await AppEventsLogger.getAnonymousID();
        if (anonymousId) {
          Purchases.setFBAnonymousID(anonymousId);
        }
        try {
          Purchases.collectDeviceIdentifiers();
          Purchases.enableAdServicesAttributionTokenCollection();
        } catch {
          // IDFA may already be set — safe to ignore
        }

        console.log('Meta + RevenueCat attribution initialized');
      } catch (e) {
        console.log('Meta/RevenueCat attribution init failed:', e);
      }

      // Initialize TikTok SDK + fire the one-time SKAN install postback.
      // The install postback registers the install with SKAdNetwork and opens
      // the conversion window — it must fire for signup/purchase to attribute.
      try {
        await initTikTokSdk();
        trackInstallIfNeeded(); // SKAN install postback (fineValue 1), deduped per install
      } catch (e) {
        console.log('TikTok/SKAN init failed:', e);
      }

      // Initialize Amplitude
      try {
        const amplitudeApiKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY!;
        console.log('Initializing Amplitude');
        await amplitude.init(amplitudeApiKey, undefined, { serverZone: 'EU', disableCookies: true })
          .promise;
        const sessionReplayPlugin = new SessionReplayPlugin({ sampleRate: 1.0 });
        amplitude.add(sessionReplayPlugin);
        console.log('Amplitude Session Replay enabled');

        // Initialize Amplitude Experiment
        const deploymentKey = process.env.EXPO_PUBLIC_AMPLITUDE_DEPLOYMENT_KEY;
        if (deploymentKey) {
          const experimentClient = Experiment.initializeWithAmplitudeAnalytics(deploymentKey, {
            serverZone: 'eu',
          });
          await experimentClient.fetch();
          experimentClientRef.current = experimentClient;
          console.log('Amplitude Experiment initialized');
        }
      } catch (e) {
        console.log('Amplitude init failed:', e);
      }

      setExperimentsReady(true);
    };

    initAnalytics();
  }, []);

  const getVariant = (flagKey: string): string | undefined => {
    return experimentClientRef.current?.variant(flagKey)?.value;
  };

  const contextValue: AnalyticsContextType = {
    ...analytics,
    getVariant,
    experimentsReady,
  };

  return <AnalyticsContext.Provider value={contextValue}>{children}</AnalyticsContext.Provider>;
}
