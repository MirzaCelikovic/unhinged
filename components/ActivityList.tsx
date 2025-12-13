import { View, Text, Pressable } from 'react-native';
import { CircleChevronRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { FollowerStats, AccountListType, getAccountListLabel } from '~/lib/useFollowerStats';

interface ActivityListProps {
  stats: FollowerStats;
  userId: string;
  isMainAccount?: boolean;
}

export default function ActivityList({ stats, userId, isMainAccount = false }: ActivityListProps) {
  const items: { type: AccountListType; count: number }[] = [
    { type: 'addedFollowing', count: stats.addedFollowing },
    { type: 'removedFollowing', count: stats.removedFollowing },
    // { type: 'gainedFollowers', count: stats.gainedFollowers },
    { type: 'lostFollowers', count: stats.lostFollowers },
    { type: 'notFollowedBack', count: stats.notFollowedBack },
    { type: 'notFollowingBack', count: stats.notFollowingBack },
  ];

  return (
    <View className="w-full rounded-3xl border-2 border-gray-400 bg-white px-2 py-2">
      {items.map((item, index) => (
        <View key={item.type}>
          <Pressable
            className="flex-row items-center justify-between p-4 py-6 active:bg-gray-50"
            onPress={() => router.push(`/list?userId=${userId}&type=${item.type}&isMainAccount=${isMainAccount}`)}>
            <Text className="text-lg font-semibold text-gray-900">
              {getAccountListLabel(item.type, isMainAccount)}
            </Text>
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
