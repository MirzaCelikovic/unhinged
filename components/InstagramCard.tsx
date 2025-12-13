import { View, Text, Image } from 'react-native';
import { Instagram } from '~/lib/types';

interface InstagramCardProps {
  account: Instagram;
}

export default function InstagramCard({ account }: InstagramCardProps) {
  return (
    <View className="w-full rounded-3xl border-2 border-gray-400 bg-white p-4">
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
              <Text className="font-roboto-bold text-2xl">{account.media_count}</Text>
              <Text className="font-roboto-regular text-sm text-gray-500">posts</Text>
            </View>
          )}

          {/* Followers */}
          {account.followers_count !== null && account.followers_count !== undefined && (
            <View className="items-center">
              <Text className="font-roboto-bold text-2xl">{account.followers_count}</Text>
              <Text className="font-roboto-regular text-sm text-gray-500">followers</Text>
            </View>
          )}

          {/* Following */}
          {account.following_count !== null && account.following_count !== undefined && (
            <View className="items-center">
              <Text className="font-roboto-bold text-2xl">{account.following_count}</Text>
              <Text className="font-roboto-regular text-sm text-gray-500">following</Text>
            </View>
          )}
        </View>
      </View>

      {/* Username */}
      <Text className="mt-3 font-roboto-bold text-base">@{account.username}</Text>

      {/* Biography */}
      <Text className="font-roboto-regular mt-1 text-base text-gray-500" numberOfLines={3}>
        {account.biography || 'Lorem ipsum dolor sit amet'}
      </Text>
    </View>
  );
}
