import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, LOG_LEVEL } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { analytics, Events } from '~/contexts/AnalyticsContext';
import { isHardPaywallOffering, isOnboardingGateSource } from '~/lib/hardPaywall';
import { getHardPaywallVariant, setHardPaywallVariant } from '~/lib/storage';

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

  // Hard-paywall A/B (COM-38): is this user being served the treatment (B) offering?
  isHardPaywall: boolean;

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
  // Hard-paywall A/B (COM-38): mirror the served offering + a dismissable fallback
  // in refs so the paywall callbacks read the latest without re-creating.
  const currentOfferingRef = useRef<PurchasesOffering | null>(null);
  const dismissableOfferingRef = useRef<PurchasesOffering | null>(null);

  // Derive subscription status from customer info
  const isSubscribed = customerInfo?.entitlements.active[ENTITLEMENT_ID] !== undefined;

  // Hard-paywall A/B (COM-38): true when RevenueCat serves this user the treatment
  // (B) offering (metadata.hard_paywall). State-derived so the UI releases the
  // moment the experiment stops; fail-open (null offering => false).
  const isHardPaywall = isHardPaywallOffering(currentOffering);

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
          currentOfferingRef.current = offerings.current;
          // A dismissable (control) offering to fall back to for hard-paywall (B)
          // users at non-onboarding surfaces, so they're never soft-locked in-app.
          dismissableOfferingRef.current =
            Object.values(offerings.all).find((o) => !isHardPaywallOffering(o)) ?? offerings.current;
          // Record the assigned arm once, for analytics attribution (COM-38).
          if (!getHardPaywallVariant()) {
            const variant = isHardPaywallOffering(offerings.current) ? 'hard' : 'control';
            setHardPaywallVariant(variant);
            analytics.setUserProperties({ hard_paywall_variant: variant });
          }
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
      // Present the current offering. Never pass an explicit offering here:
      // that bypasses `current`, and with it any RevenueCat experiment or
      // targeting rule, silently excluding these users from both.
      //
      // Exception (COM-38): a hard-paywall (B) user's `current` offering is
      // close-less. We only want that non-dismissable paywall at the onboarding
      // gate; at every other surface present an explicit dismissable (control)
      // offering so B users are never soft-locked deep in the app.
      const useDismissable =
        !isOnboardingGateSource(source) &&
        isHardPaywallOffering(currentOfferingRef.current) &&
        dismissableOfferingRef.current != null;
      const result = useDismissable
        ? await RevenueCatUI.presentPaywall({ offering: dismissableOfferingRef.current! })
        : await RevenueCatUI.presentPaywall();

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
          analytics.track(Events.PAYWALL_CLOSED, { source, result: 'not_presented' });
          return false;
        case PAYWALL_RESULT.ERROR:
          analytics.track(Events.PAYWALL_CLOSED, { source, result: 'error' });
          return false;
        case PAYWALL_RESULT.CANCELLED:
        default:
          analytics.track(Events.PAYWALL_CLOSED, { source, result: 'cancelled' });
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
      // See presentPaywall: no explicit offering, so `current` (and any
      // experiment/targeting rule layered on it) applies — except a hard-paywall
      // (B) user gets a dismissable (control) offering at these non-onboarding
      // surfaces (this method is never the onboarding gate). (COM-38)
      const useDismissable =
        isHardPaywallOffering(currentOfferingRef.current) && dismissableOfferingRef.current != null;
      const result = useDismissable
        ? await RevenueCatUI.presentPaywallIfNeeded({
            requiredEntitlementIdentifier: ENTITLEMENT_ID,
            offering: dismissableOfferingRef.current!,
          })
        : await RevenueCatUI.presentPaywallIfNeeded({
            requiredEntitlementIdentifier: ENTITLEMENT_ID,
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
          analytics.track(Events.PAYWALL_CLOSED, { source, result: 'error' });
          return false;
        case PAYWALL_RESULT.CANCELLED:
        default:
          analytics.track(Events.PAYWALL_CLOSED, { source, result: 'cancelled' });
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
    isHardPaywall,
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
