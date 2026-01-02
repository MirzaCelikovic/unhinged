import { View, Alert, ScrollView, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';
import { useInstagram, useRemoveTrackedInstagram } from '~/lib/useInstagram';
import { markInstagramActivityAsViewed } from '~/lib/useInstagramActivity';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import InstagramCard from '~/components/InstagramCard';
// import ActivityList from '~/components/ActivityList';
import ActivityFeed from '~/components/ActivityFeed';
import TrackedAccountSync from '~/components/TrackedAccountSync';
import Button from '~/components/Button';

export default function TrackingAccount() {
  const { userId, username } = useLocalSearchParams<{ userId: string; username: string }>();
  const { account } = useAccountContext();
  const { syncState } = useInstagramContext();
  const removeTrackedInstagram = useRemoveTrackedInstagram();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  // Check if this account is still syncing
  const syncStatus = syncState.trackedAccounts.find((acc) => acc.userId === userId);
  const isSyncing = syncStatus && (
    syncStatus.metadata === 'syncing' ||
    syncStatus.following === 'syncing' ||
    syncStatus.followers === 'syncing'
  );

  // Get Instagram data for this account
  const { data: instagram } = useInstagram(userId || null);

  // Mark activity as viewed when opening this screen
  useEffect(() => {
    if (userId) {
      markInstagramActivityAsViewed(db, userId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['instagramActivity', userId] });
      });
    }
  }, [userId]);

  const handleStopTracking = () => {
    if (!account?.uuid || !userId) return;

    Alert.alert('Stop Tracking', `Stop tracking @${instagram?.username || username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop Tracking',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeTrackedInstagram.mutateAsync({ accountId: account.uuid, userId });
            // Wait a bit for cache invalidation to propagate
            setTimeout(() => {
              router.back();
            }, 100);
          } catch (error) {
            console.error('Failed to remove tracked instagram:', error);
            Alert.alert('Error', 'Failed to stop tracking. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <View className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView>
        <View className="flex-row items-center justify-between px-4 pb-3">
          <View className="flex-1 items-center pt-6">
            <Logo width={160} height={30} />
          </View>
          <Pressable
            className="absolute right-4 p-2 active:opacity-70"
            onPress={() => router.back()}>
            <X size={24} color="#000000" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Content */}
      {isSyncing && userId ? (
        <TrackedAccountSync userId={userId} username={instagram?.username || ''} />
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="gap-4 p-4">
            {instagram && <InstagramCard account={instagram} />}
            {userId && (
              <ActivityFeed
                userId={userId}
                trackedUsername={instagram?.username}
                trackedProfilePicUrl={instagram?.profile_pic_url}
              />
            )}
            {/* {stats && userId && <ActivityList stats={stats} userId={userId} />} */}
          </View>
          <View className="mt-auto p-4 pb-12">
            <Button
              label="Stop Tracking"
              onPress={handleStopTracking}
              loading={removeTrackedInstagram.isPending}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
