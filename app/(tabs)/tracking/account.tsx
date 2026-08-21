import { View, Text, Alert, ScrollView, StyleSheet, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';
import { useInstagram, useRemoveTrackedInstagram } from '~/lib/useInstagram';
import { useFollowerStats } from '~/lib/useFollowerStats';
import { useInstagramActivity } from '~/lib/useInstagramActivity';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import InstagramCard from '~/components/InstagramCard';
import ActivityList from '~/components/ActivityList';
import ActivityFeed from '~/components/ActivityFeed';
import TrackedAccountSync from '~/components/TrackedAccountSync';
import {
  FOLLOWERS_WARN_THRESHOLD,
  FOLLOWING_WARN_THRESHOLD,
} from '~/lib/constants';
import { useTranslation } from 'react-i18next';

export default function TrackingAccount() {
  const { t } = useTranslation();
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
  const { data: stats } = useFollowerStats(userId || null);
  const { data: activityCounts } = useInstagramActivity(userId || null);
  const { isSubscribed } = useRevenueCat();

  // Show indicator on Insights tab if not subscribed or has unread activity
  const hasInsightsIndicator = !isSubscribed || activityCounts?.hasNewActivity;

  // Segmented nav state
  const [activeTab, setActiveTab] = useState<'feed' | 'stats' | 'settings'>('feed');

  // Sync preferences
  const { data: syncPrefs } = useQuery({
    queryKey: ['syncPrefs', userId],
    queryFn: async () => {
      const result = await db.getFirstAsync<{
        followers_sync_disabled: number;
        following_sync_disabled: number;
      }>(
        'SELECT followers_sync_disabled, following_sync_disabled FROM sync_state WHERE instagram_user_id = ?',
        [userId]
      );
      return result;
    },
    enabled: !!userId,
  });

  const [trackFollowing, setTrackFollowing] = useState(true);
  const [trackFollowers, setTrackFollowers] = useState(true);

  useEffect(() => {
    if (syncPrefs) {
      setTrackFollowing(!syncPrefs.following_sync_disabled);
      setTrackFollowers(!syncPrefs.followers_sync_disabled);
    }
  }, [syncPrefs]);

  const followersCount = instagram?.followers_count || 0;
  const followingCount = instagram?.following_count || 0;
  const followersWarn = followersCount >= FOLLOWERS_WARN_THRESHOLD;
  const followingWarn = followingCount >= FOLLOWING_WARN_THRESHOLD;

  const handleToggleFollowing = async (value: boolean) => {
    setTrackFollowing(value);
    await db.runAsync(
      'UPDATE sync_state SET following_sync_disabled = ?, date_updated = ? WHERE instagram_user_id = ?',
      [value ? 0 : 1, new Date().toISOString(), userId]
    );
    queryClient.invalidateQueries({ queryKey: ['syncPrefs', userId] });
  };

  const handleToggleFollowers = async (value: boolean) => {
    setTrackFollowers(value);
    await db.runAsync(
      'UPDATE sync_state SET followers_sync_disabled = ?, date_updated = ? WHERE instagram_user_id = ?',
      [value ? 0 : 1, new Date().toISOString(), userId]
    );
    queryClient.invalidateQueries({ queryKey: ['syncPrefs', userId] });
  };

  const handleStopTracking = () => {
    if (!account?.uuid || !userId) return;

    Alert.alert(
      t('tracking.account.stopTrackingAlertTitle'),
      t('tracking.account.stopTrackingAlertMessage', { username: instagram?.username || username }),
      [
        { text: t('tracking.account.cancel'), style: 'cancel' },
        {
          text: t('tracking.account.stopTracking'),
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
              Alert.alert(t('tracking.account.errorAlertTitle'), t('tracking.account.errorAlertMessage'));
            }
          },
        },
      ]
    );
  };

  return (
    <View className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView edges={['top']}>
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

            {/* Segmented Nav */}
            <View className="flex-row items-center gap-2">
              <Pressable
                className={`rounded-full px-4 py-2 ${activeTab === 'feed' ? 'bg-white' : ''}`}
                onPress={() => setActiveTab('feed')}>
                <Text
                  className={`font-roboto-medium text-sm ${activeTab === 'feed' ? 'text-gray-900' : 'text-gray-500'}`}>
                  {t('tracking.account.tabActivity')}
                </Text>
              </Pressable>
              <Pressable
                className={`flex-row items-center gap-2 rounded-full px-4 py-2 ${activeTab === 'stats' ? 'bg-white' : ''}`}
                onPress={() => setActiveTab('stats')}>
                <Text
                  className={`font-roboto-medium text-sm ${activeTab === 'stats' ? 'text-gray-900' : 'text-gray-500'}`}>
                  {t('tracking.account.tabInsights')}
                </Text>
                {hasInsightsIndicator && (
                  <View className="h-3 w-3 rounded-full bg-error" />
                )}
              </Pressable>
              <Pressable
                className={`ml-auto rounded-full px-4 py-2 ${activeTab === 'settings' ? 'bg-white' : ''}`}
                onPress={() => setActiveTab('settings')}>
                <Text
                  className={`font-roboto-medium text-sm ${activeTab === 'settings' ? 'text-gray-900' : 'text-gray-500'}`}>
                  {t('tracking.account.tabSettings')}
                </Text>
              </Pressable>
            </View>

            {/* Tab Content */}
            {activeTab === 'feed' && userId && (
              <ActivityFeed
                userId={userId}
                trackedUsername={instagram?.username}
                trackedProfilePicUrl={instagram?.profile_pic_url}
              />
            )}
            {activeTab === 'stats' && stats && userId && (
              <ActivityList stats={stats} userId={userId} activityCounts={activityCounts} />
            )}
            {activeTab === 'settings' && (
              <View className="overflow-hidden rounded-2xl bg-white">
                <View className="border-b border-gray-100 p-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-roboto-medium text-base text-gray-900">
                      {t('tracking.account.syncFollowingActivity')}
                    </Text>
                    <Switch
                      value={trackFollowing}
                      onValueChange={handleToggleFollowing}
                      trackColor={{ false: '#d1d5db', true: '#000000' }}
                      thumbColor="#ffffff"
                    />
                  </View>
                  {followingWarn && (
                    <Text className="mt-2 font-roboto-regular text-sm text-gray-400">
                      {t('tracking.account.rateLimitWarningFollowing')}
                    </Text>
                  )}
                </View>
                <View className="border-b border-gray-100 p-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-roboto-medium text-base text-gray-900">
                      {t('tracking.account.syncFollowersActivity')}
                    </Text>
                    <Switch
                      value={trackFollowers}
                      onValueChange={handleToggleFollowers}
                      trackColor={{ false: '#d1d5db', true: '#000000' }}
                      thumbColor="#ffffff"
                    />
                  </View>
                  {followersWarn && (
                    <Text className="mt-2 font-roboto-regular text-sm text-gray-400">
                      {t('tracking.account.rateLimitWarningFollowers')}
                    </Text>
                  )}
                </View>
                <Pressable
                  className="p-4 active:opacity-80"
                  onPress={handleStopTracking}>
                  <Text className="font-roboto-medium text-base text-error">{t('tracking.account.stopTracking')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
