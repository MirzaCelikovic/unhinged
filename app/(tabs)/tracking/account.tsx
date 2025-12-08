import { View, Alert, ScrollView, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useAccountContext } from '~/contexts/AccountContext';
import { useRemoveTrackedInstagram } from '~/lib/useInstagram';
import { useFollowerStats } from '~/lib/useFollowerStats';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import InstagramCard from '~/components/InstagramCard';
import ActivityList from '~/components/ActivityList';
import Button from '~/components/Button';

export default function TrackingAccount() {
  const { userId, username } = useLocalSearchParams<{ userId: string; username: string }>();
  const { account, trackedInstagrams } = useAccountContext();
  const removeTrackedInstagram = useRemoveTrackedInstagram();

  // Find the Instagram data for this account from the context
  const instagram = trackedInstagrams.find((ig) => ig.user_id === userId);

  // Get follower stats for this account
  const { data: stats } = useFollowerStats(userId || null);

  const handleStopTracking = () => {
    if (!account?.uuid || !userId) return;

    Alert.alert('Stop Tracking', `Stop tracking @${username}?`, [
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
      <ScrollView className="flex-1">
        <View className="gap-4 p-4 pb-24">
          {instagram && <InstagramCard account={instagram} />}
          {stats && <ActivityList stats={stats} />}
          <Button
            label="Stop Tracking"
            mode="destructive"
            onPress={handleStopTracking}
            loading={removeTrackedInstagram.isPending}
          />
        </View>
      </ScrollView>
    </View>
  );
}
