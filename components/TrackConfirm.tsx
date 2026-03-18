import { View, Text, ScrollView, Switch } from 'react-native';
import InstagramCard from '~/components/InstagramCard';
import Button from '~/components/Button';
import { Instagram } from '~/lib/types';
import {
  FOLLOWERS_WARN_THRESHOLD,
  FOLLOWING_WARN_THRESHOLD,
} from '~/lib/constants';

interface TrackConfirmProps {
  profile: Instagram;
  followersCount: number;
  followingCount: number;
  trackFollowing: boolean;
  trackFollowers: boolean;
  onToggleFollowing: (value: boolean) => void;
  onToggleFollowers: (value: boolean) => void;
  onStartTracking: () => void;
  isLoading: boolean;
}

export default function TrackConfirm({
  profile,
  followersCount,
  followingCount,
  trackFollowing,
  trackFollowers,
  onToggleFollowing,
  onToggleFollowers,
  onStartTracking,
  isLoading,
}: TrackConfirmProps) {
  const followersWarn = followersCount >= FOLLOWERS_WARN_THRESHOLD;
  const followingWarn = followingCount >= FOLLOWING_WARN_THRESHOLD;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
      <View className="flex-1 px-4 pb-8">
        {/* Title */}
        <Text className="mb-8 mt-6 text-center font-roboto-extrablack text-4xl tracking-tighter">
          What we found
        </Text>

        {/* Account card */}
        <InstagramCard account={profile} />

        {/* Sync toggles */}
        <View className="mt-6 overflow-hidden rounded-2xl bg-white">
          {/* Following toggle */}
          <View className="border-b border-gray-100 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-roboto-medium text-base text-gray-900">
                Sync following activity
              </Text>
              <Switch
                value={trackFollowing}
                onValueChange={onToggleFollowing}
                trackColor={{ false: '#d1d5db', true: '#000000' }}
                thumbColor="#ffffff"
              />
            </View>
            {followingWarn && (
              <Text className="mt-2 font-roboto-regular text-sm text-gray-400">
                We recommend keeping this off for this account to protect your Instagram session from rate limiting.
              </Text>
            )}
          </View>

          {/* Followers toggle */}
          <View className="p-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-roboto-medium text-base text-gray-900">
                Sync followers activity
              </Text>
              <Switch
                value={trackFollowers}
                onValueChange={onToggleFollowers}
                trackColor={{ false: '#d1d5db', true: '#000000' }}
                thumbColor="#ffffff"
              />
            </View>
            {followersWarn && (
              <Text className="mt-2 font-roboto-regular text-sm text-gray-400">
                We recommend keeping this off for this account to protect your Instagram session from rate limiting.
              </Text>
            )}
          </View>
        </View>

        {/* Start tracking button */}
        <View className="mt-6">
          <Button
            label="Start Tracking"
            onPress={onStartTracking}
            loading={isLoading}
          />
        </View>
      </View>
    </ScrollView>
  );
}
