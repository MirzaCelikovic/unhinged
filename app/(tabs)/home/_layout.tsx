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
          headerShown: true,
          headerTitle: '',
          headerTransparent: true,
          headerShadowVisible: false,
          header: () => <LogoHeader />,
        }}
      />
      <Stack.Screen
        name="accounts"
        options={({ route }) => ({
          headerShown: true,
          headerTitle: TITLES[route.params?.type as keyof typeof TITLES] || 'Accounts',
          headerBackTitle: 'Home',
          headerStyle: {
            backgroundColor: '#FFE51F',
          },
          headerShadowVisible: false,
        })}
      />
    </Stack>
  );
}
