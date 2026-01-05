import { useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { Instagram, HatGlasses, Settings } from 'lucide-react-native';
import { useOnboarding } from '~/lib/useOnboarding';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAccountContext } from '~/contexts/AccountContext';
import Purchases from 'react-native-purchases';

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
    if (Platform.OS === 'ios' && isOnboarded && isInitialized && !isSubscribed) {
      presentPaywallIfNeeded();
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
        tabBarInactiveTintColor: '#6b7280',
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
          tabBarIcon: ({ color }) => <Instagram color={color} size={28} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: 'Tracking',
          tabBarLabel: 'Tracking',
          tabBarIcon: ({ color }) => <HatGlasses color={color} size={28} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Settings color={color} size={28} />,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
