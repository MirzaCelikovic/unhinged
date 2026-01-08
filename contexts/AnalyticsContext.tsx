import React, { createContext, useContext, useEffect, useRef } from 'react';
import * as amplitude from '@amplitude/analytics-react-native';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { CustomerIO } from 'customerio-reactnative';

export const Events = {
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

    // Initialize Amplitude
    const amplitudeApiKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY!;
    console.log('Initializing Amplitude');
    amplitude.init(amplitudeApiKey, undefined, { serverZone: 'EU', disableCookies: true }).promise.then(() => {
      const sessionReplayPlugin = new SessionReplayPlugin({ sampleRate: 1.0 });
      amplitude.add(sessionReplayPlugin);
      console.log('Amplitude Session Replay enabled');
    });
  }, []);

  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
}
