import { useEffect, useRef, useState } from 'react';
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

export default function TabLayout() {
  const { isLoading, isOnboarded } = useOnboarding();
  const { isInitialized, isSubscribed, presentPaywallOnLaunch } = useRevenueCat();
  const { account, trackedInstagrams } = useAccountContext();
  const { sessionExpired, reconnect } = useInstagram();
  const sessionExpiredSheetRef = useRef<BottomSheetModal>(null);
  const [paywallHandled, setPaywallHandled] = useState(false);
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

  // Show paywall on mount if user doesn't have a subscription (after onboarding)
  useEffect(() => {
    const handlePaywall = async () => {
      if (isOnboarded && isInitialized && !isSubscribed) {
        await presentPaywallOnLaunch();
      }
      setPaywallHandled(true);
    };
    if (isOnboarded && isInitialized) {
      handlePaywall();
    }
  }, [isOnboarded, isInitialized, isSubscribed]);

  // Show session expired sheet after paywall is handled
  useEffect(() => {
    if (paywallHandled && sessionExpired) {
      sessionExpiredSheetRef.current?.present();
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
    </>
  );
}
