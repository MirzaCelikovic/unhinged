import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { AccountProvider } from '~/contexts/AccountContext';
import { InstagramProvider } from '~/contexts/InstagramContext';
import { SheetProvider } from '~/contexts/SheetContext';
import { initializeDatabase } from '~/lib/database';
import { CustomerIO, CioRegion } from 'customerio-reactnative';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import '../global.css';

SplashScreen.preventAutoHideAsync();

const qc = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'RobotoFlex': require('../assets/fonts/RobotoFlex-Regular.ttf'),
    'RobotoFlex-Medium': require('../assets/fonts/RobotoFlex-Medium.ttf'),
    'RobotoFlex-Bold': require('../assets/fonts/RobotoFlex-Bold.ttf'),
    'RobotoFlex-Black': require('../assets/fonts/RobotoFlex-Black.ttf'),
    'RobotoFlex-ExtraBlack': require('../assets/fonts/RobotoFlex-ExtraBlack.ttf'),
  });

  useEffect(() => {
    // Initialize Customer.io SDK
    const cdpApiKey = process.env.EXPO_PUBLIC_CUSTOMER_IO_CDP_API_KEY!;
    console.log('🔧 Initializing Customer.io with CDP API Key:', cdpApiKey);
    CustomerIO.initialize({
      cdpApiKey,
      region: CioRegion.EU,
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="unhinged.db" onInit={initializeDatabase}>
        <QueryClientProvider client={qc}>
          <AccountProvider>
            <BottomSheetModalProvider>
              <SheetProvider>
                <InstagramProvider>
                  <Stack>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="track" options={{ presentation: 'modal', headerShown: false }} />
                  </Stack>
                </InstagramProvider>
              </SheetProvider>
            </BottomSheetModalProvider>
          </AccountProvider>
        </QueryClientProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
