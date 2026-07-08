import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { analytics, Events } from '~/contexts/AnalyticsContext';
import { getAgeGroup, AgeGroup } from '~/lib/storage';

// RevenueCat API Key from environment (platform-specific)
const REVENUECAT_API_KEY = Platform.OS === 'android'
  ? process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_GOOG!
  : process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_APPL!;

// Entitlement identifier
export const ENTITLEMENT_ID = 'Unhinged Subscription';

// Product identifiers
export const PRODUCTS = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

// Age-based pricing (COM-6). Each onboarding age bucket maps to a RevenueCat
// offering identifier that bundles the correctly-priced weekly + annual
// products for that bucket. These offerings are configured in the RevenueCat
// dashboard; until they exist we fall back to the current offering.
export const AGE_OFFERINGS: Record<AgeGroup, string> = {
  '18_24': 'age_18_24',
  '25_34': 'age_25_34',
  '35_plus': 'age_35_plus',
};

// Resolve the offering for the user's stored age group, or null to fall back
// to the current offering — when no age was captured (e.g. users who onboarded
// before this feature) or the age offering isn't configured yet in RevenueCat.
const resolveAgeOffering = async (): Promise<PurchasesOffering | null> => {
  const ageGroup = getAgeGroup();
  if (!ageGroup) return null;
  const offeringId = AGE_OFFERINGS[ageGroup];
  if (!offeringId) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all[offeringId] ?? null;
  } catch (e) {
    console.error('Error resolving age offering:', e);
    return null;
  }
};

interface RevenueCatContextType {
  // State
  isInitialized: boolean;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  isLoading: boolean;
  error: string | null;

  // Subscription status
  isSubscribed: boolean;
  subscriptionPlan: string | null;
  expirationDate: Date | null;

  // Actions
  presentPaywall: (source?: string) => Promise<boolean>;
  presentPaywallIfNeeded: (source?: string) => Promise<boolean>;
  presentPaywallOnLaunch: () => Promise<boolean>;
  skipLaunchPaywall: () => void;
  restorePurchases: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
  presentCustomerCenter: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export const useRevenueCat = () => {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
};

// Hook to check if user has active subscription
export const useIsSubscribed = () => {
  const { isSubscribed } = useRevenueCat();
  return isSubscribed;
};

// Hook to get subscription details
export const useSubscriptionDetails = () => {
  const { isSubscribed, subscriptionPlan, expirationDate } = useRevenueCat();
  return { isSubscribed, subscriptionPlan, expirationDate };
};

interface RevenueCatProviderProps {
  children: React.ReactNode;
}

export const RevenueCatProvider: React.FC<RevenueCatProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasShownAutomaticPaywallRef = useRef(false);

  // Derive subscription status from customer info
  const isSubscribed = customerInfo?.entitlements.active[ENTITLEMENT_ID] !== undefined;

  const subscriptionPlan = (() => {
    const entitlement = customerInfo?.entitlements.active[ENTITLEMENT_ID];
    if (!entitlement) return null;
    return entitlement.productIdentifier;
  })();

  const expirationDate = (() => {
    const entitlement = customerInfo?.entitlements.active[ENTITLEMENT_ID];
    if (!entitlement?.expirationDate) return null;
    return new Date(entitlement.expirationDate);
  })();

  // Initialize RevenueCat SDK
  useEffect(() => {
    const initializeRevenueCat = async () => {
      try {
        // Enable debug logs in development
        if (__DEV__) {
          Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        }

        // Configure with API key
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY });

        console.log('RevenueCat initialized successfully');
        setIsInitialized(true);

        // Fetch initial customer info
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);

        // Fetch offerings
        const offerings = await Purchases.getOfferings();
        if (offerings.current) {
          setCurrentOffering(offerings.current);
        }

        setIsLoading(false);
      } catch (e) {
        console.error('Error initializing RevenueCat:', e);
        setError(e instanceof Error ? e.message : 'Failed to initialize RevenueCat');
        setIsLoading(false);
      }
    };

    initializeRevenueCat();
  }, []);

  // Listen for customer info updates
  useEffect(() => {
    const customerInfoUpdated = (info: CustomerInfo) => {
      console.log('Customer info updated:', info.entitlements.active);
      setCustomerInfo(info);
    };

    Purchases.addCustomerInfoUpdateListener(customerInfoUpdated);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(customerInfoUpdated);
    };
  }, []);

  // Present paywall
  const presentPaywall = useCallback(async (source?: string): Promise<boolean> => {
    try {
      analytics.track(Events.PAYWALL_VIEWED, { source });
      const ageOffering = await resolveAgeOffering();
      const result = await RevenueCatUI.presentPaywall(
        ageOffering ? { offering: ageOffering } : undefined
      );

      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
          // Refresh customer info after purchase/restore
          const info = await Purchases.getCustomerInfo();
          setCustomerInfo(info);
          const entitlement = info.entitlements.active[ENTITLEMENT_ID];
          // Only track if there's actually an active entitlement
          if (entitlement) {
            analytics.track(Events.PURCHASE, {
              source,
              product: entitlement.productIdentifier,
              restored: result === PAYWALL_RESULT.RESTORED,
            });
          }
          return true;
        case PAYWALL_RESULT.NOT_PRESENTED:
        case PAYWALL_RESULT.ERROR:
        case PAYWALL_RESULT.CANCELLED:
        default:
          analytics.track(Events.PAYWALL_CLOSED);
          return false;
      }
    } catch (e) {
      console.error('Error presenting paywall:', e);
      return false;
    }
  }, []);

  // Present paywall only if user doesn't have entitlement
  const presentPaywallIfNeeded = useCallback(async (source?: string): Promise<boolean> => {
    try {
      analytics.track(Events.PAYWALL_VIEWED, { source });
      const ageOffering = await resolveAgeOffering();
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
        ...(ageOffering ? { offering: ageOffering } : {}),
      });

      switch (result) {
        case PAYWALL_RESULT.PURCHASED:
        case PAYWALL_RESULT.RESTORED:
          const info = await Purchases.getCustomerInfo();
          setCustomerInfo(info);
          const entitlement = info.entitlements.active[ENTITLEMENT_ID];
          // Only track if there's actually an active entitlement
          if (entitlement) {
            analytics.track(Events.PURCHASE, {
              source,
              product: entitlement.productIdentifier,
              restored: result === PAYWALL_RESULT.RESTORED,
            });
          }
          return true;
        case PAYWALL_RESULT.NOT_PRESENTED:
          // User already has entitlement
          return true;
        case PAYWALL_RESULT.ERROR:
        case PAYWALL_RESULT.CANCELLED:
        default:
          analytics.track(Events.PAYWALL_CLOSED);
          return false;
      }
    } catch (e) {
      console.error('Error presenting paywall:', e);
      return false;
    }
  }, []);

  // Present paywall on launch (only once per session)
  const presentPaywallOnLaunch = useCallback(async (): Promise<boolean> => {
    if (hasShownAutomaticPaywallRef.current) {
      return false;
    }
    hasShownAutomaticPaywallRef.current = true;
    return presentPaywallIfNeeded('app_launch');
  }, [presentPaywallIfNeeded]);

  const skipLaunchPaywall = useCallback(() => {
    hasShownAutomaticPaywallRef.current = true;
  }, []);

  // Restore purchases
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      setIsLoading(false);

      // Check if restore was successful (user has entitlement)
      return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    } catch (e) {
      console.error('Error restoring purchases:', e);
      setError(e instanceof Error ? e.message : 'Failed to restore purchases');
      setIsLoading(false);
      return false;
    }
  }, []);

  // Refresh customer info
  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (e) {
      console.error('Error refreshing customer info:', e);
    }
  }, []);

  // Present Customer Center (for managing subscriptions)
  const presentCustomerCenter = useCallback(async () => {
    try {
      // Customer Center is available via RevenueCatUI
      // Note: This requires proper configuration in RevenueCat dashboard
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
      console.error('Error presenting customer center:', e);
      // Fallback: Open subscription management URL
      // On iOS, this would open the App Store subscription management
      // On Android, this would open the Google Play subscription management
    }
  }, []);

  const value: RevenueCatContextType = {
    isInitialized,
    customerInfo,
    currentOffering,
    isLoading,
    error,
    isSubscribed,
    subscriptionPlan,
    expirationDate,
    presentPaywall,
    presentPaywallIfNeeded,
    presentPaywallOnLaunch,
    skipLaunchPaywall,
    restorePurchases,
    refreshCustomerInfo,
    presentCustomerCenter,
  };

  return <RevenueCatContext.Provider value={value}>{children}</RevenueCatContext.Provider>;
};
