import { Stack } from 'expo-router';
import { View, SafeAreaView } from 'react-native';
import Logo from '~/assets/logo_black.svg';

const TITLES = {
  notFollowingBack: 'Not Following You Back',
  notFollowingYouBack: "You're Not Following Back",
  recentlyUnfollowed: 'Recently Unfollowed You',
  recentlyFollowed: 'Recently Followed You',
};

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
