import { useCallback, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Purchases from 'react-native-purchases';
import Circles from '~/assets/circles.svg';
import Onboarding from '~/components/Onboarding';
import OnboardingV2 from '~/components/onboarding-v2/OnboardingV2';
import { useOnboarding } from '~/lib/useOnboarding';
import { useAnalytics } from '~/contexts/AnalyticsContext';
import { useRevenueCat, ENTITLEMENT_ID } from '~/contexts/RevenueCatContext';
import { clearOnboardingProgress } from '~/lib/storage';
import { ONBOARDING_GATE_SOURCE } from '~/lib/hardPaywall';

export default function Start() {
  const { completeOnboarding } = useOnboarding();
  const { getVariant, experimentsReady } = useAnalytics();
  const { isHardPaywall, isSubscribed, presentPaywall } = useRevenueCat();
  // The gate is async and long-running, and the v1 connect effect re-fires when
  // onComplete's identity changes — without this a re-render mid-gate would present
  // a second paywall and duplicate events. One gate at a time. (COM-38)
  const gateInFlightRef = useRef(false);

  const finishOnboarding = useCallback(() => {
    clearOnboardingProgress();
    completeOnboarding();
    router.replace('/');
  }, [completeOnboarding]);

  const handleComplete = useCallback(async () => {
    if (gateInFlightRef.current) return;
    gateInFlightRef.current = true;
    try {
      // Hard-paywall gate (COM-38, backstop): a B-arm user cannot finish onboarding
      // without a subscription. The v2 reveal screen enforces this directly; this
      // covers every other completion path (e.g. the v1 fallback) independently, so
      // the gate never depends on one screen. Fail-open: not a B user => complete.
      if (isHardPaywall && !isSubscribed) {
        let hasEntitlement = false;
        try {
          // Fresh read: the context's isSubscribed can lag a frame behind a purchase
          // made moments ago at the reveal, which would otherwise bounce the user.
          const info = await Purchases.getCustomerInfo();
          hasEntitlement = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
        } catch {
          // Network blip — fall through to the paywall rather than failing silently;
          // the user can still purchase or restore from there.
        }
        if (!hasEntitlement) {
          const purchased = await presentPaywall(ONBOARDING_GATE_SOURCE);
          if (!purchased) return; // stay in onboarding until they subscribe
        }
      }
      finishOnboarding();
    } finally {
      gateInFlightRef.current = false;
    }
  }, [isHardPaywall, isSubscribed, presentPaywall, finishOnboarding]);

  const variant = experimentsReady ? getVariant('onboarding') : undefined;

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      <SafeAreaView className="flex-1">
        {!experimentsReady ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#000000" />
          </View>
        ) : variant === 'v2' ? (
          <OnboardingV2 onComplete={handleComplete} />
        ) : (
          <Onboarding onComplete={handleComplete} />
        )}
      </SafeAreaView>
    </View>
  );
}
