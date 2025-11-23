import { Stack } from 'expo-router';

export default function TrackingLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerTitle: 'Tracking',
        }}
      />
      <Stack.Screen
        name="account"
        options={({ route }) => ({
          headerShown: true,
          headerTitle: route.params?.username ? `@${route.params.username}` : 'Account',
          headerBackTitle: 'Tracking',
        })}
      />
    </Stack>
  );
}
