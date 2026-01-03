import { View, Text, Pressable } from 'react-native';
import { CircleChevronRight } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { FollowerStats, AccountListType, getAccountListLabel } from '~/lib/useFollowerStats';

interface ActivityListProps {
  stats: FollowerStats;
  userId: string;
  isMainAccount?: boolean;
}

export default function ActivityList({ stats, userId, isMainAccount = false }: ActivityListProps) {
  const pathname = usePathname();
  const tab = pathname.includes('/tracking') ? 'tracking' : 'home';

  const items: { type: AccountListType; count: number }[] = [
    { type: 'addedFollowing', count: stats.addedFollowing },
    { type: 'gainedFollowers', count: stats.gainedFollowers },
    { type: 'lostFollowers', count: stats.lostFollowers },
    { type: 'notFollowedBack', count: stats.notFollowedBack },
    { type: 'notFollowingBack', count: stats.notFollowingBack },
  ];

  const formatCount = (count: number): string => {
    if (count >= 1_000_000) {
      return `${Math.round(count / 1_000_000)}M`;
    }
    if (count >= 10_000) {
      return `${Math.round(count / 1_000)}K`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    }
    return count.toString();
  };

  return (
    <View className="gap-3">
      {items.map((item) => (
        <Pressable
          key={item.type}
          className="flex-row items-center gap-3 rounded-2xl bg-white p-4 active:opacity-80"
          onPress={() => router.push(`/(tabs)/${tab}/list?userId=${userId}&type=${item.type}&isMainAccount=${isMainAccount}`)}>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Text className="font-roboto-bold text-sm text-gray-600">{formatCount(item.count)}</Text>
          </View>
          <Text className="flex-1 font-roboto-medium text-base text-gray-900">
            {getAccountListLabel(item.type, isMainAccount)}
          </Text>
          <CircleChevronRight size={20} color="#9ca3af" />
        </Pressable>
      ))}
    </View>
  );
}
