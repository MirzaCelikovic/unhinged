import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useOnboarding } from '~/lib/useOnboarding';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram } from '~/contexts/InstagramContext';
import { useInstagramActivity, useHasAnyInstagramActivity } from '~/lib/useInstagramActivity';
import Purchases from 'react-native-purchases';
import TabHomeIcon from '~/assets/tab_home_icon.svg';
import TabTrackingIcon from '~/assets/tab_tracking_icon.svg';
import TabSettingsIcon from '~/assets/tab_settings_icon.svg';
import SessionExpiredSheet from '~/components/SessionExpiredSheet';
import AgePrompt from '~/components/AgePrompt';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import { getAgeGroup, setAgeGroup, AgeGroup } from '~/lib/storage';

export default function TabLayout() {
  const { isLoading, isOnboarded } = useOnboarding();
  const {
    isInitialized,
    isSubscribed,
    isLoading: rcLoading,
    presentPaywallOnLaunch,
  } = useRevenueCat();
  const { account, trackedInstagrams } = useAccountContext();
  const { sessionExpired, reconnect } = useInstagram();
  const { track } = useAnalytics();
  const sessionExpiredSheetRef = useRef<BottomSheetModal>(null);
  const [paywallHandled, setPaywallHandled] = useState(false);
  const [needsAge, setNeedsAge] = useState(false);
  const mainUserId = account?.instagram_user_id || null;
  const { data: mainAccountActivity } = useInstagramActivity(mainUserId);
  const hasMainAccountActivity = mainAccountActivity?.hasNewActivity || false;
  const trackedUserIds = trackedInstagrams.map((ig) => ig.user_id);
  const { data: hasAnyTrackedActivity } = useHasAnyInstagramActivity(trackedUserIds);
  // Show home tab indicator if not subscribed (we show fake indicators in activity list), or if there's actual activity
  const showHomeIndicator = (!isSubscribed && mainUserId) || hasMainAccountActivity;
  // Show tracking tab indicator if not subscribed and has tracked accounts, or if there's actual activity
  const showTrackingIndicator = (!isSubscribed && trackedInstagrams.length > 0) || hasAnyTrackedActivity;

  // Log in to RevenueCat with account UUID
  useEffect(() => {
    if (isInitialized && account?.uuid) {
      Purchases.logIn(account.uuid)
        .then(() => console.log('RevenueCat: User logged in:', account.uuid))
        .catch((e) => console.error('RevenueCat: Error logging in:', e));
    }
  }, [isInitialized, account?.uuid]);

  const runLaunchPaywall = useCallback(async () => {
    if (!isSubscribed) {
      await presentPaywallOnLaunch();
    }
    setPaywallHandled(true);
  }, [isSubscribed, presentPaywallOnLaunch]);

  // Age no longer affects pricing (COM-36 reverted COM-6) — everyone gets the current
  // offering. We still capture it once for users who onboarded before the age question
  // existed, because segmentation and ad-signal suppression (COM-11) depend on it.
  const handleAgeSelected = (ageGroup: AgeGroup) => {
    setAgeGroup(ageGroup);
    track(Events.AGE_SELECTED, { age_group: ageGroup, source: 'existing_user_prompt' });
    setNeedsAge(false);
    runLaunchPaywall();
  };

  // Show paywall on mount if user doesn't have a subscription (after onboarding).
  // Gated on rcLoading so customerInfo is loaded — we never prompt an existing subscriber.
  useEffect(() => {
    if (!isOnboarded || !isInitialized || rcLoading) return;
    if (!isSubscribed && !getAgeGroup()) {
      setNeedsAge(true);
      return;
    }
    runLaunchPaywall();
  }, [isOnboarded, isInitialized, rcLoading, isSubscribed, runLaunchPaywall]);

  // Show session expired sheet after paywall is handled
  useEffect(() => {
    if (paywallHandled && sessionExpired) {
      sessionExpiredSheetRef.current?.present();
      track(Events.RECONNECT_PROMPT_SHOWN, { surface: 'sheet' });
    }
  }, [paywallHandled, sessionExpired]);

  if (isLoading) {
    return null;
  }

  if (!isOnboarded) {
    return <Redirect href="/start" />;
  }

  const handleReconnect = () => {
    sessionExpiredSheetRef.current?.dismiss();
    reconnect();
  };

  const handleMaybeLater = () => {
    sessionExpiredSheetRef.current?.dismiss();
  };

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarStyle: {
            backgroundColor: '#FFE51F',
            borderTopWidth: 0,
          },
          tabBarActiveTintColor: '#000000',
          tabBarInactiveTintColor: '#717147ff',
          tabBarShowLabel: false,
          tabBarIconStyle: {
            marginTop: 8,
          },
        }}>
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarLabel: 'Home',
            tabBarIcon: ({ color }) => (
              <View>
                <TabHomeIcon color={color} width={28} height={28} />
                {showHomeIndicator && (
                  <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-error" />
                )}
              </View>
            ),
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="tracking"
          options={{
            title: 'Tracking',
            tabBarLabel: 'Tracking',
            tabBarIcon: ({ color }) => (
              <View>
                <TabTrackingIcon color={color} width={28} height={28} />
                {showTrackingIndicator && (
                  <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-error" />
                )}
              </View>
            ),
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color }) => <TabSettingsIcon color={color} width={28} height={28} />,
            headerShown: false,
          }}
        />
      </Tabs>
      <SessionExpiredSheet
        ref={sessionExpiredSheetRef}
        onReconnect={handleReconnect}
        onMaybeLater={handleMaybeLater}
      />
      {needsAge && <AgePrompt onSelect={handleAgeSelected} />}
    </>
  );
}
