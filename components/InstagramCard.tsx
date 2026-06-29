import { View, Text, Image, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, usePathname } from 'expo-router';
import { Instagram } from '~/lib/types';
import { useRevenueCat } from '~/contexts/RevenueCatContext';

const formatCount = (count: number): string => {
  if (count >= 1_000_000) {
    return `${Math.round(count / 1_000_000)}M`;
  }
  if (count >= 10_000) {
    return `${Math.round(count / 1_000)}K`;
  }
  return count.toLocaleString();
};

interface InstagramCardProps {
  account: Instagram;
  isMainAccount?: boolean;
}

export default function InstagramCard({ account, isMainAccount = false }: InstagramCardProps) {
  const { t } = useTranslation('home');
  const pathname = usePathname();
  const tab = pathname.includes('/tracking') ? 'tracking' : 'home';
  const { isSubscribed, presentPaywall } = useRevenueCat();

  const handleFollowersTap = () => {
    if (!isMainAccount && !isSubscribed) {
      presentPaywall('instagram_card_followers');
      return;
    }
    router.push(
      `/(tabs)/${tab}/list?userId=${account.user_id}&type=allFollowers&isMainAccount=${isMainAccount}`
    );
  };

  const handleFollowingTap = () => {
    if (!isMainAccount && !isSubscribed) {
      presentPaywall('instagram_card_following');
      return;
    }
    router.push(
      `/(tabs)/${tab}/list?userId=${account.user_id}&type=allFollowing&isMainAccount=${isMainAccount}`
    );
  };
  return (
    <View className="w-full rounded-2xl bg-white p-4">
      {/* Top row: Profile pic and stats */}
      <View className="flex-row items-center">
        {/* Profile Picture */}
        {account.profile_pic_url ? (
          <Image
            source={{ uri: account.profile_pic_url }}
            className="h-[80px] w-[80px] rounded-full"
          />
        ) : (
          <View className="h-[80px] w-[80px] rounded-full bg-gray-200" />
        )}

        {/* Stats */}
        <View className="ml-8 flex-1 flex-row gap-6">
          {/* Posts */}
          {account.media_count !== null && account.media_count !== undefined && (
            <View className="items-center">
              <Text className="font-roboto-bold text-2xl">{formatCount(account.media_count)}</Text>
              <Text className="font-roboto-regular text-sm text-gray-500">{t('stats.posts')}</Text>
            </View>
          )}

          {/* Followers */}
          {account.followers_count !== null && account.followers_count !== undefined && (
            <Pressable className="items-center active:opacity-70" onPress={handleFollowersTap}>
              <Text className="font-roboto-bold text-2xl">
                {formatCount(account.followers_count)}
              </Text>
              <Text className="font-roboto-regular text-sm text-gray-500">{t('stats.followers')}</Text>
            </Pressable>
          )}

          {/* Following */}
          {account.following_count !== null && account.following_count !== undefined && (
            <Pressable className="items-center active:opacity-70" onPress={handleFollowingTap}>
              <Text className="font-roboto-bold text-2xl">
                {formatCount(account.following_count)}
              </Text>
              <Text className="font-roboto-regular text-sm text-gray-500">{t('stats.following')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Username */}
      <Text className="mt-3 font-roboto-bold text-base">@{account.username}</Text>

      {/* Biography or Full Name */}
      {(account.biography || account.full_name) && (
        <Text className="mt-1 font-roboto-regular text-base text-gray-500" numberOfLines={3}>
          {account.biography || account.full_name}
        </Text>
      )}
    </View>
  );
}
