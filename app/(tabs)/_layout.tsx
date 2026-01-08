import { useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useOnboarding } from '~/lib/useOnboarding';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAccountContext } from '~/contexts/AccountContext';
import Purchases from 'react-native-purchases';
import TabHomeIcon from '~/assets/tab_home_icon.svg';
import TabTrackingIcon from '~/assets/tab_tracking_icon.svg';
import TabSettingsIcon from '~/assets/tab_settings_icon.svg';

export default function TabLayout() {
  const { isLoading, isOnboarded } = useOnboarding();
  const { isInitialized, isSubscribed, presentPaywallIfNeeded } = useRevenueCat();
  const { account } = useAccountContext();

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
      presentPaywallIfNeeded('app_launch');
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
          tabBarIcon: ({ color }) => <TabHomeIcon color={color} width={28} height={28} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: 'Tracking',
          tabBarLabel: 'Tracking',
          tabBarIcon: ({ color }) => <TabTrackingIcon color={color} width={28} height={28} />,
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
