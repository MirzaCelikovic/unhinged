import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '~/assets/logo_black.svg';

function LogoHeader() {
  return (
    <SafeAreaView>
      <View className="mt-2 items-center justify-center">
        <Logo width={160} height={30} />
      </View>
    </SafeAreaView>
  );
}

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="list"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
    </Stack>
  );
}
