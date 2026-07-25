import { Stack } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import i18n from '~/lib/i18n';
import Logo from '~/assets/logo_black.svg';

const TITLES = {
  notFollowingBack: i18n.t('nav:homeListTitle.notFollowingBack'),
  notFollowingYouBack: i18n.t('nav:homeListTitle.notFollowingYouBack'),
  recentlyUnfollowed: i18n.t('nav:homeListTitle.recentlyUnfollowed'),
  recentlyFollowed: i18n.t('nav:homeListTitle.recentlyFollowed'),
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
