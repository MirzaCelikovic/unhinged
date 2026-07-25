import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { AccountProvider } from '~/contexts/AccountContext';
import { AnalyticsProvider } from '~/contexts/AnalyticsContext';
import { InstagramProvider } from '~/contexts/InstagramContext';
import { RevenueCatProvider } from '~/contexts/RevenueCatContext';
import { initializeDatabase } from '~/lib/database';
import { CustomerIO, CioRegion } from 'customerio-reactnative';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import '../global.css';
import '../lib/i18n';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],
});


// Disable console.log in production for performance
if (!__DEV__) {
  console.log = () => {};
}

// Configure notification handling for foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

SplashScreen.preventAutoHideAsync();

const qc = new QueryClient();

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded] = useFonts({
    RobotoFlex: require('../assets/fonts/RobotoFlex-Regular.ttf'),
    'RobotoFlex-Medium': require('../assets/fonts/RobotoFlex-Medium.ttf'),
    'RobotoFlex-Bold': require('../assets/fonts/RobotoFlex-Bold.ttf'),
    'RobotoFlex-Black': require('../assets/fonts/RobotoFlex-Black.ttf'),
    'RobotoFlex-ExtraBlack': require('../assets/fonts/RobotoFlex-ExtraBlack.ttf'),
  });

  useEffect(() => {
    // Initialize Customer.io SDK
    const cdpApiKey = process.env.EXPO_PUBLIC_CUSTOMER_IO_CDP_API_KEY!;
    console.log('Initializing Customer.io with CDP API Key:', cdpApiKey);
    CustomerIO.initialize({
      cdpApiKey,
      region: CioRegion.EU,
    });
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#FFE51F' }}>
      <StatusBar style="dark" />
      <SQLiteProvider databaseName="unhinged.db" onInit={initializeDatabase}>
        <QueryClientProvider client={qc}>
          <RevenueCatProvider>
            <AnalyticsProvider>
              <AccountProvider>
                <BottomSheetModalProvider>
                  <InstagramProvider>
                    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="start" />
                      <Stack.Screen name="tracking" options={{ presentation: 'modal' }} />
                    </Stack>
                  </InstagramProvider>
                </BottomSheetModalProvider>
              </AccountProvider>
            </AnalyticsProvider>
          </RevenueCatProvider>
        </QueryClientProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
});