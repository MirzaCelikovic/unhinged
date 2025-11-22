import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useInstagram } from '~/contexts/InstagramContext';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react-native';
import { useFollowerStats } from '~/lib/useFollowerStats';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

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
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6b7280" />
      </View>
    );
  }

  // Show login button if not logged in
  if (!isLoggedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Pressable
          className="bg-blue-500 px-6 py-3 rounded-lg active:bg-blue-600"
          onPress={showLogin}
        >
          <Text className="text-white text-lg font-semibold">Connect Instagram</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="p-4">
        {/* Header with last sync time and refresh button */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-base font-medium text-gray-500 uppercase">{formatLastSyncTime(stats.lastSyncedAt)}</Text>
          <Pressable
            className="px-4 py-2 active:opacity-70"
            onPress={sync}
            disabled={isSyncing}
          >
            <Text className="text-base font-medium text-blue-500">
              {isSyncing ? 'Syncing...' : 'Refresh'}
            </Text>
          </Pressable>
        </View>

        {/* Stats Cards */}
        <View className="gap-3">
          <Pressable
            className="bg-gray-100 rounded-2xl p-4 flex-row items-center justify-between active:bg-gray-200"
            onPress={() => router.push('/home/accounts?type=notFollowingBack')}
          >
            <Text className="text-lg font-semibold text-gray-900">Not following you back</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-gray-500">{stats.notFollowingBack}</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </View>
          </Pressable>

          <Pressable
            className="bg-gray-100 rounded-2xl p-4 flex-row items-center justify-between active:bg-gray-200"
            onPress={() => router.push('/home/accounts?type=notFollowingYouBack')}
          >
            <Text className="text-lg font-semibold text-gray-900">You're not following back</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-gray-500">{stats.notFollowingYouBack}</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </View>
          </Pressable>

          <Pressable
            className="bg-gray-100 rounded-2xl p-4 flex-row items-center justify-between active:bg-gray-200"
            onPress={() => router.push('/home/accounts?type=recentlyUnfollowed')}
          >
            <Text className="text-lg font-semibold text-gray-900">Recently unfollowed you</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-gray-500">{stats.recentlyUnfollowed}</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </View>
          </Pressable>

          <Pressable
            className="bg-gray-100 rounded-2xl p-4 flex-row items-center justify-between active:bg-gray-200"
            onPress={() => router.push('/home/accounts?type=recentlyFollowed')}
          >
            <Text className="text-lg font-semibold text-gray-900">Recently followed you</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg font-semibold text-gray-500">{stats.recentlyFollowed}</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </View>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
