import { useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { House, HatGlasses, Settings } from 'lucide-react-native';
import { useOnboarding } from '~/lib/useOnboarding';
import { useRevenueCat } from '~/contexts/RevenueCatContext';

export default function TabLayout() {
  const { isLoading, isOnboarded } = useOnboarding();
  const { isInitialized, isSubscribed, presentPaywallIfNeeded } = useRevenueCat();

  // Show paywall on mount if user doesn't have a subscription (after onboarding)
  useEffect(() => {
    if (isOnboarded && isInitialized && !isSubscribed) {
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
          tabBarIcon: ({ color }) => <House color={color} size={28} />,
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
