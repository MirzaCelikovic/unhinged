import { Stack } from 'expo-router';
import { InstagramProvider } from '~/contexts/InstagramContext';
import '../global.css';

export default function RootLayout() {
  return (
    <InstagramProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Home' }} />
      </Stack>
    </InstagramProvider>
  );
}
