import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';
import { useInstagram } from '~/lib/useInstagram';
import { useEffect, useState } from 'react';
import { ChevronRight, RefreshCcw } from 'lucide-react-native';
import { useFollowerStats } from '~/lib/useFollowerStats';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import InstagramCard from '~/components/InstagramCard';
import ActivityList from '~/components/ActivityList';
import NotConnected from '~/components/NotConnected';
import InitialSync from '~/components/InitialSync';
import { useAccountContext } from '~/contexts/AccountContext';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';

type HomeState = 'notConnected' | 'initialSync' | 'connected';

export default function Index() {
  const { isLoggedIn, isSyncing, showLogin, disconnect, sync, userId } = useInstagramContext();
  const { account } = useAccountContext();
  const { data: instagram } = useInstagram(userId);
  const { data: stats } = useFollowerStats(userId);
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [homeState, setHomeState] = useState<HomeState | null>(null);
  const contentOpacity = useSharedValue(1);

  // Set initial home state when login status is determined
  useEffect(() => {
    if (isLoggedIn === null) return; // Wait for login check

    if (homeState !== null) return; // Already initialized

    if (isLoggedIn === false) {
      setHomeState('notConnected');
    } else {
      // Returning user - go straight to connected
      setHomeState('connected');
    }
  }, [isLoggedIn, homeState]);

  // Handle login state changes (for fresh logins after initial load)
  useEffect(() => {
    if (isLoggedIn === true && homeState === 'notConnected') {
      // Just logged in - transition to initial sync
      contentOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) {
          runOnJS(setHomeState)('initialSync');
        }
      });
    } else if (isLoggedIn === false && homeState === 'connected') {
      // Logged out - go back to not connected
      setHomeState('notConnected');
    }
  }, [isLoggedIn, homeState]);

  // Handle state transitions with fade in
  useEffect(() => {
    if (homeState === 'initialSync' || homeState === 'connected') {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [homeState]);

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

  const handleInitialSyncComplete = () => {
    // Invalidate queries to fetch fresh data
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['followerStats', userId] });
    }

    contentOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setHomeState)('connected');
      }
    });
  };


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

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

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

  return (
    <View className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {homeState === 'notConnected' && (
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          <NotConnected onConnect={showLogin} />
        </Animated.View>
      )}

      {homeState === 'initialSync' && userId && account?.instagram_username && (
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          <InitialSync
            userId={userId}
            username={account.instagram_username}
            onComplete={handleInitialSyncComplete}
            isMainAccount={true}
          />
        </Animated.View>
      )}

      {homeState === 'connected' && (
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
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
          {instagram && (
            <View className="mb-6">
              <InstagramCard account={instagram} />
            </View>
          )}

          {/* Activity List */}
          <ActivityList stats={stats} userId={userId!} isMainAccount />
        </View>
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}
