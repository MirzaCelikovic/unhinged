import { Stack, useRouter } from 'expo-router';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleChevronLeft } from 'lucide-react-native';
import Logo from '~/assets/logo_black.svg';

function LogoHeader() {
  return (
    <View className="mt-2 items-center justify-center">
      <Logo width={160} height={30} />
    </View>
  );
}

export default function TrackingLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="track"
        options={{
          presentation: 'modal',
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
