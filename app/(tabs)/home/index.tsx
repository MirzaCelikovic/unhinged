import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useInstagram } from '~/contexts/InstagramContext';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react-native';
import { useFollowerStats } from '~/lib/useFollowerStats';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import Instagram from '~/assets/instagram.svg';
import Button from '~/components/Button';

function NotConnected({ onConnect }: { onConnect: () => void }) {
  return (
    <SafeAreaView className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <View className="mt-32 flex-1 items-center justify-center">
        <Instagram width={120} height={120} />
        <Text className="font-roboto-extrablack mt-6 px-12 text-center text-5xl tracking-tighter">
          Connect your Instagram
        </Text>
        <Text className="font-roboto-regular mt-6 px-12 text-center text-lg tracking-tighter">
          Start monitoring your followers and discover who's not following you back
        </Text>
      </View>
      <View className="p-4 pb-20">
        <Button label="Connect Instagram" mode="add" onPress={onConnect} />
      </View>
    </SafeAreaView>
  );
}

export default function Index() {
  const { isLoggedIn, isSyncing, showLogin, disconnect, sync, userId } = useInstagram();
  const { data: stats } = useFollowerStats(userId);
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute to refresh the "X mins ago" display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Invalidate stats query when sync completes
  useEffect(() => {
    if (!isSyncing && userId) {
      console.log('✅ Sync complete, invalidating followerStats query');
      queryClient.invalidateQueries({ queryKey: ['followerStats', userId] });
    }
  }, [isSyncing, userId]);

  const formatLastSyncTime = (timestamp: string | null): string => {
    if (!timestamp) return 'Never synced';

    const syncDate = new Date(timestamp);
    const diffMs = currentTime.getTime() - syncDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Updated just now';
    if (diffMins < 60) return `Updated ${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `Updated ${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
    return `Updated ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  // Show spinner while checking login status
  if (isLoggedIn === null) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <Circles width={700} height={700} />
        </View>
        <ActivityIndicator size="large" color="#6b7280" />
      </View>
    );
  }

  // Show login button if not logged in
  if (!isLoggedIn) {
    return <NotConnected onConnect={showLogin} />;
  }

  return (
    <View className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <ScrollView className="flex-1">
        <View className="p-4">
          {/* Header with last sync time and refresh button */}
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-medium uppercase text-gray-500">
              {formatLastSyncTime(stats.lastSyncedAt)}
            </Text>
            <Pressable className="px-4 py-2 active:opacity-70" onPress={sync} disabled={isSyncing}>
              <Text className="text-base font-medium text-blue-500">
                {isSyncing ? 'Syncing...' : 'Refresh'}
              </Text>
            </Pressable>
          </View>

          {/* Stats Cards */}
          <View className="gap-3">
            <Pressable
              className="flex-row items-center justify-between rounded-2xl bg-gray-100 p-4 active:bg-gray-200"
              onPress={() => router.push('/home/accounts?type=notFollowingBack')}>
              <Text className="text-lg font-semibold text-gray-900">Not following you back</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-semibold text-gray-500">
                  {stats.notFollowingBack}
                </Text>
                <ChevronRight size={20} color="#9ca3af" />
              </View>
            </Pressable>

            <Pressable
              className="flex-row items-center justify-between rounded-2xl bg-gray-100 p-4 active:bg-gray-200"
              onPress={() => router.push('/home/accounts?type=notFollowingYouBack')}>
              <Text className="text-lg font-semibold text-gray-900">You're not following back</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-semibold text-gray-500">
                  {stats.notFollowingYouBack}
                </Text>
                <ChevronRight size={20} color="#9ca3af" />
              </View>
            </Pressable>

            <Pressable
              className="flex-row items-center justify-between rounded-2xl bg-gray-100 p-4 active:bg-gray-200"
              onPress={() => router.push('/home/accounts?type=recentlyUnfollowed')}>
              <Text className="text-lg font-semibold text-gray-900">Recently unfollowed you</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-semibold text-gray-500">
                  {stats.recentlyUnfollowed}
                </Text>
                <ChevronRight size={20} color="#9ca3af" />
              </View>
            </Pressable>

            <Pressable
              className="flex-row items-center justify-between rounded-2xl bg-gray-100 p-4 active:bg-gray-200"
              onPress={() => router.push('/home/accounts?type=recentlyFollowed')}>
              <Text className="text-lg font-semibold text-gray-900">Recently followed you</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-semibold text-gray-500">
                  {stats.recentlyFollowed}
                </Text>
                <ChevronRight size={20} color="#9ca3af" />
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
