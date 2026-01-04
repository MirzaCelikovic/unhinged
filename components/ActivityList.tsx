import { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { CircleChevronRight, Lock } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { FollowerStats, AccountListType, getAccountListLabel } from '~/lib/useFollowerStats';
import { useRevenueCat } from '~/contexts/RevenueCatContext';

interface ActivityListProps {
  stats: FollowerStats;
  userId: string;
  isMainAccount?: boolean;
}

export default function ActivityList({ stats, userId, isMainAccount = false }: ActivityListProps) {
  const pathname = usePathname();
  const tab = pathname.includes('/tracking') ? 'tracking' : 'home';
  const { isSubscribed, presentPaywall } = useRevenueCat();

  const items: { type: AccountListType; count: number }[] = [
    { type: 'addedFollowing', count: stats.addedFollowing },
    { type: 'removedFollowing', count: stats.removedFollowing },
    { type: 'gainedFollowers', count: stats.gainedFollowers },
    { type: 'lostFollowers', count: stats.lostFollowers },
    { type: 'notFollowedBack', count: stats.notFollowedBack },
    { type: 'notFollowingBack', count: stats.notFollowingBack },
  ];

  // Generate stable random numbers for non-subscribed users
  const fakeNumbers = useMemo(() => {
    return items.map(() => Math.floor(Math.random() * 199) + 1);
  }, []);

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

  const handlePress = (item: { type: AccountListType; count: number }) => {
    if (!isSubscribed) {
      presentPaywall();
      return;
    }
    router.push(
      `/(tabs)/${tab}/list?userId=${userId}&type=${item.type}&isMainAccount=${isMainAccount}`
    );
  };

  return (
    <View className="overflow-hidden rounded-2xl bg-white">
      {items.map((item, index) => (
        <Pressable
          key={item.type}
          className={`flex-row items-center justify-between p-6 active:opacity-80 ${index < items.length - 1 ? 'border-b border-gray-100' : ''}`}
          onPress={() => handlePress(item)}>
          <Text className="font-roboto-medium text-base text-gray-900">
            {getAccountListLabel(item.type, isMainAccount)}
          </Text>
          <View className="flex-row items-center gap-2">
            {isSubscribed ? (
              <>
                <Text className="pr-4 font-roboto-bold text-lg text-gray-600">
                  {formatCount(item.count)}
                </Text>
                <CircleChevronRight size={24} color="#9ca3af" />
              </>
            ) : (
              <>
                <View className="relative overflow-hidden rounded-md">
                  <Text className="px-2 font-roboto-bold text-lg text-gray-600">
                    {fakeNumbers[index]}
                  </Text>
                  <BlurView
                    intensity={12}
                    tint="light"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                </View>
                <CircleChevronRight size={24} color="#9ca3af" />
              </>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
