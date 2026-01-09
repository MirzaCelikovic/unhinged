import { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useOnboarding } from '~/lib/useOnboarding';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagramActivity, useHasAnyInstagramActivity } from '~/lib/useInstagramActivity';
import Purchases from 'react-native-purchases';
import TabHomeIcon from '~/assets/tab_home_icon.svg';
import TabTrackingIcon from '~/assets/tab_tracking_icon.svg';
import TabSettingsIcon from '~/assets/tab_settings_icon.svg';

export default function TabLayout() {
  const { isLoading, isOnboarded } = useOnboarding();
  const { isInitialized, isSubscribed, presentPaywallOnLaunch } = useRevenueCat();
  const { account, trackedInstagrams } = useAccountContext();
  const mainUserId = account?.instagram_user_id || null;
  const { data: mainAccountActivity } = useInstagramActivity(mainUserId);
  const hasMainAccountActivity = mainAccountActivity?.hasNewActivity || false;
  const trackedUserIds = trackedInstagrams.map((ig) => ig.user_id);
  const { data: hasAnyTrackedActivity } = useHasAnyInstagramActivity(trackedUserIds);

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
    if (isOnboarded && isInitialized && !isSubscribed) {
      presentPaywallOnLaunch();
    }
  }, [isOnboarded, isInitialized, isSubscribed]);

  if (isLoading) {
    return null;
  }

  if (!isOnboarded) {
    return <Redirect href="/start" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          position: 'absolute',
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
              {hasMainAccountActivity && (
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
              {hasAnyTrackedActivity && (
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
  );
}
