import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { AccountProvider } from '~/contexts/AccountContext';
import { InstagramProvider } from '~/contexts/InstagramContext';
import { initializeDatabase } from '~/lib/database';
import '../global.css';

const qc = new QueryClient();

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="unhinged.db" onInit={initializeDatabase}>
      <QueryClientProvider client={qc}>
        <AccountProvider>
          <InstagramProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </InstagramProvider>
        </AccountProvider>
      </QueryClientProvider>
    </SQLiteProvider>
  );
}
