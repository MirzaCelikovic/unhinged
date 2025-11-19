import { View, Text, Pressable, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { ArrowLeft } from 'lucide-react-native';
import { useAccountContext } from '~/contexts/AccountContext';
import { useRemoveTrack } from '~/lib/useTracks';
import { getFollowingActivity, ActivityItem } from '~/lib/syncing';

export default function TrackingAccount() {
  const { userId, username } = useLocalSearchParams<{ userId: string; username: string }>();
  const { account } = useAccountContext();
  const db = useSQLiteContext();
  const removeTrack = useRemoveTrack();

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      if (!userId) return;

      setIsLoading(true);
      try {
        const data = await getFollowingActivity(db, userId);
        setActivity(data);
      } catch (error) {
        console.error('Error fetching activity:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActivity();
  }, [userId, db]);

  const handleStopTracking = () => {
    if (!account?.uuid || !userId) return;

    Alert.alert('Stop Tracking', `Stop tracking @${username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop Tracking',
        style: 'destructive',
        onPress: () => {
          removeTrack.mutate(
            { accountId: account.uuid, userId },
            {
              onSuccess: () => {
                router.back();
              },
            }
          );
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="border-b border-gray-200 px-4 pb-4 pt-16">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="active:opacity-70">
            <ArrowLeft size={24} color="#000" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-2xl font-bold">@{username}</Text>
            <Text className="text-sm text-gray-500">{userId}</Text>
          </View>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6b7280" />
        </View>
      ) : activity.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-gray-500">No activity yet</Text>
        </View>
      ) : (
        <ScrollView className="flex-1">
          {activity.map((item, index) => (
            <View key={index} className="border-b border-gray-100 p-4">
              <Text className="text-sm font-semibold text-gray-600 mb-2">{item.date}</Text>

              {item.unfollows.length > 0 && (
                <Text className="text-base mb-1">
                  Stopped following {item.unfollows.map((u) => `@${u}`).join(', ')}
                </Text>
              )}

              {item.newFollows.length > 0 && (
                <Text className="text-base mb-1">
                  Started following {item.newFollows.map((u) => `@${u}`).join(', ')}
                </Text>
              )}

              {item.isTrackingStart && item.newFollows.length === 0 && item.unfollows.length === 0 && (
                <Text className="text-base text-gray-500">Started tracking this account</Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Stop Tracking Button */}
      <View className="border-t border-gray-200 p-4">
        <Pressable
          className="bg-red-500 py-3 rounded-lg active:opacity-70"
          onPress={handleStopTracking}
          disabled={removeTrack.isPending}>
          <Text className="text-center font-semibold text-white">
            {removeTrack.isPending ? 'Removing...' : 'Stop Tracking'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
