import { Stack } from 'expo-router';

const TITLES = {
  notFollowingBack: 'Not Following You Back',
  notFollowingYouBack: "You're Not Following Back",
  recentlyUnfollowed: 'Recently Unfollowed You',
  recentlyFollowed: 'Recently Followed You',
};

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerTitle: 'Home',
        }}
      />
      <Stack.Screen
        name="accounts"
        options={({ route }) => ({
          headerShown: true,
          headerTitle: TITLES[route.params?.type as keyof typeof TITLES] || 'Accounts',
          headerBackTitle: 'Home',
        })}
      />
    </Stack>
  );
}
