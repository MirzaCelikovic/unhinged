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
import { ChevronRight, RefreshCcw } from 'lucide-react-native';
import { useFollowerStats } from '~/lib/useFollowerStats';
import { useQueryClient } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import InstagramCard from '~/components/InstagramCard';
import ActivityList from '~/components/ActivityList';
import NotConnected from '~/components/NotConnected';
import { Instagram as InstagramType } from '~/lib/types';

export default function Index() {
  const { isLoggedIn, isSyncing, showLogin, disconnect, sync, userId } = useInstagram();
  const { data: stats } = useFollowerStats(userId);
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [instagramAccount, setInstagramAccount] = useState<InstagramType | null>(null);

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

  // Fetch Instagram account data
  useEffect(() => {
    if (!userId) return;

    const fetchInstagramAccount = async () => {
      try {
        const account = await db.getFirstAsync<InstagramType>(
          `SELECT
            i.user_id,
            i.username,
            i.profile_pic_url,
            i.biography,
            i.media_count,
            i.date_created,
            i.date_updated,
            (SELECT COUNT(*) FROM followings WHERE tracked_account_id = i.user_id AND ended_at IS NULL) as following_count,
            (SELECT COUNT(*) FROM followers WHERE tracked_account_id = i.user_id AND ended_at IS NULL) as followers_count
           FROM instagrams i
           WHERE i.user_id = ?`,
          [userId]
        );
        setInstagramAccount(account || null);
      } catch (error) {
        console.error('Error fetching Instagram account:', error);
      }
    };

    fetchInstagramAccount();
  }, [userId, isSyncing]);

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
        <View className="p-4 pt-32">
          {/* Header with last sync time and refresh button */}
          <View className="flex-row items-center justify-between px-3 py-1">
            <Text className="font-roboto-medium text-sm uppercase tracking-wide text-black">
              {formatLastSyncTime(stats.lastSyncedAt)}
            </Text>
            <Pressable className="py-2 active:opacity-70" onPress={sync} disabled={isSyncing}>
              <Text className="font-roboto-medium text-sm uppercase tracking-wide text-black">
                {isSyncing ? 'Syncing...' : 'Refresh'}
              </Text>
            </Pressable>
          </View>

          {/* Instagram Account Card */}
          {instagramAccount && (
            <View className="mb-6">
              <InstagramCard account={instagramAccount} />
            </View>
          )}

          {/* Activity List */}
          <ActivityList stats={stats} />
        </View>
      </ScrollView>
    </View>
  );
}
