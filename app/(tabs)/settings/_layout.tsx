import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerTitle: 'Settings',
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: true,
          headerTitle: 'Notifications',
          headerBackTitle: 'Settings',
        }}
      />
    </Stack>
  );
}
