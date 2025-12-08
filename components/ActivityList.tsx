import { View, Text, Pressable } from 'react-native';
import { CircleChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { FollowerStats } from '~/lib/useFollowerStats';

interface ActivityListProps {
  stats: FollowerStats;
}

export default function ActivityList({ stats }: ActivityListProps) {
  const items = [
    {
      label: 'Recently followed',
      count: stats.recentlyFollowed,
      route: '/home/accounts?type=recentlyFollowed',
    },
    {
      label: 'Recently unfollowed',
      count: stats.recentlyUnfollowed,
      route: '/home/accounts?type=recentlyUnfollowed',
    },
    {
      label: 'Followed them',
      count: stats.recentlyFollowedThem,
      route: '/home/accounts?type=recentlyFollowedThem',
    },
    {
      label: 'Unfollowed them',
      count: stats.recentlyUnfollowedThem,
      route: '/home/accounts?type=recentlyUnfollowedThem',
    },
    {
      label: "They aren't following back",
      count: stats.notFollowingBack,
      route: '/home/accounts?type=notFollowingBack',
    },
    {
      label: 'Not following them back',
      count: stats.notFollowingYouBack,
      route: '/home/accounts?type=notFollowingYouBack',
    },
  ];

  return (
    <View className="w-full rounded-3xl bg-white px-2 py-2">
      {items.map((item, index) => (
        <View key={item.route}>
          <Pressable
            className="flex-row items-center justify-between p-4 py-6 active:bg-gray-50"
            onPress={() => router.push(item.route as any)}>
            <Text className="text-lg font-semibold text-gray-900">{item.label}</Text>
            <View className="flex-row items-center gap-2">
              <Text className="px-4 text-lg font-semibold text-gray-500">{item.count}</Text>
              <CircleChevronRight size={24} color="black" />
            </View>
          </Pressable>
          {index < items.length - 1 && <View className="mx-4 h-[1px] bg-gray-100" />}
        </View>
      ))}
    </View>
  );
}
