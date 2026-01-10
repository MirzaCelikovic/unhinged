import { Stack } from 'expo-router';
import { View, SafeAreaView } from 'react-native';
import Logo from '~/assets/logo_black.svg';

function LogoHeader() {
  return (
    <View className="mt-2 items-center justify-center">
      <Logo width={160} height={30} />
    </View>
  );
}

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
    </Stack>
  );
}
