import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { AccountProvider } from '~/contexts/AccountContext';
import { InstagramProvider } from '~/contexts/InstagramContext';
import '../global.css';

const qc = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={qc}>
      <AccountProvider>
        <InstagramProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </InstagramProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}
