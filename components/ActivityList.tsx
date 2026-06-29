import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { CircleChevronRight, Lock } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { FollowerStats, AccountListType, getAccountListLabel } from '~/lib/useFollowerStats';
import { useRevenueCat } from '~/contexts/RevenueCatContext';

interface ActivityCounts {
  newFollowsCount: number;
  unfollowsCount: number;
  newFollowersCount: number;
  lostFollowersCount: number;
}

interface ActivityListProps {
  stats: FollowerStats;
  userId: string;
  isMainAccount?: boolean;
  activityCounts?: ActivityCounts;
}

export default function ActivityList({ stats, userId, isMainAccount = false, activityCounts }: ActivityListProps) {
  const { t } = useTranslation('home');
  const pathname = usePathname();
  const tab = pathname.includes('/tracking') ? 'tracking' : 'home';
  const { isSubscribed, presentPaywall } = useRevenueCat();

  // Check if row should show unread indicator
  const hasUnreadIndicator = (type: AccountListType): boolean => {
    if (!activityCounts) return false;
    switch (type) {
      case 'addedFollowing':
        // For tracked accounts, always show if not subscribed
        return (!isSubscribed && !isMainAccount) || activityCounts.newFollowsCount > 0;
      case 'removedFollowing':
        return activityCounts.unfollowsCount > 0;
      case 'gainedFollowers':
        // Always show if not subscribed (main or tracked)
        return !isSubscribed || activityCounts.newFollowersCount > 0;
      case 'lostFollowers':
        // For main account, always show if not subscribed
        return (!isSubscribed && isMainAccount) || activityCounts.lostFollowersCount > 0;
      default:
        return false;
    }
  };

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
      presentPaywall(isMainAccount ? 'activity_list_account' : 'activity_list_tracked');
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
          <View className="flex-row items-center gap-3">
            <Text className="font-roboto-medium text-base text-gray-900">
              {t(getAccountListLabel(item.type, isMainAccount))}
            </Text>
            {hasUnreadIndicator(item.type) && (
              <View className="h-3 w-3 rounded-full bg-error" />
            )}
          </View>
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
                  {Platform.OS === 'android' ? (
                    <Animated.Text className="px-2 font-roboto-bold text-lg text-gray-600" style={{ filter: 'blur(6px)' }}>
                      {fakeNumbers[index]}
                    </Animated.Text>
                  ) : (
                    <>
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
                    </>
                  )}
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
