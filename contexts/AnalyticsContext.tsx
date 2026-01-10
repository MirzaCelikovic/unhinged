import React, { createContext, useContext, useEffect, useRef } from 'react';
import * as amplitude from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { CustomerIO } from 'customerio-reactnative';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import Purchases from 'react-native-purchases';

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
  INSTAGRAM_CONNECTED_ONBOARDING: 'Instagram Connected Onboarding',
  INSTAGRAM_CONNECTED: 'Instagram Connected',
  ACCOUNT_TRACKED: 'Account Tracked',
  HOME_SCREEN_VIEWED: 'Home Screen Viewed',
  TRACKING_SCREEN_VIEWED: 'Tracking Screen Viewed',
  SETTINGS_SCREEN_VIEWED: 'Settings Screen Viewed',
  PAYWALL_VIEWED: 'Paywall Viewed',
  PAYWALL_CLOSED: 'Paywall Closed',
  PURCHASE: 'Purchase',
} as const;

// Standalone functions that can be called without hooks (to avoid circular deps)
export const analytics = {
  track: (event: string, properties?: Record<string, any>) => {
    amplitude.track(event, properties);
    CustomerIO.track(event, properties);
  },
  identify: (userId: string) => {
    amplitude.setUserId(userId);
  },
};

interface AnalyticsContextType {
  track: (event: string, properties?: Record<string, any>) => void;
  identify: (userId: string) => void;
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

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const initAnalytics = async () => {
      // Request tracking transparency permission (iOS only, no-op on Android)
      try {
        const { status } = await requestTrackingPermissionsAsync();
        if (status === 'granted') {
          Purchases.collectDeviceIdentifiers();
        }
      } catch (e) {
        console.log('Tracking transparency request failed:', e);
      }

      // Initialize Amplitude
      const amplitudeApiKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY!;
      console.log('Initializing Amplitude');
      await amplitude.init(amplitudeApiKey, undefined, { serverZone: 'EU', disableCookies: true })
        .promise;
      const sessionReplayPlugin = new SessionReplayPlugin({ sampleRate: 1.0 });
      amplitude.add(sessionReplayPlugin);
      console.log('Amplitude Session Replay enabled');
    };

    initAnalytics();
  }, []);

  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}
