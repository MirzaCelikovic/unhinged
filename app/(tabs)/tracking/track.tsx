import { View, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import StartTracking from '~/components/StartTracking';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';
import { useAccountContext } from '~/contexts/AccountContext';
import { useAddTrackedInstagram } from '~/lib/useInstagram';

export default function TrackModal() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedUserId, setAddedUserId] = useState<string | null>(null);
  const { fetchUserId, syncTrackedAccount, syncState } = useInstagramContext();
  const { account } = useAccountContext();
  const addTrackedInstagram = useAddTrackedInstagram();

  // Auto-close modal once metadata is fetched for the added account
  useEffect(() => {
    if (!addedUserId) return;

    const trackedAccount = syncState.trackedAccounts.find((acc) => acc.userId === addedUserId);
    if (trackedAccount?.metadata === 'complete') {
      router.back();
    }
  }, [addedUserId, syncState.trackedAccounts]);

  const handleContinue = async (inputUsername: string) => {
    setError('');

    // Validate username is not empty
    const trimmedUsername = inputUsername.trim();
    if (!trimmedUsername) {
      setError('Invalid username');
      return;
    }

    if (!account?.uuid) {
      setError('Account not ready');
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔍 Fetching user ID for:', trimmedUsername);
      // Fetch user ID and check if we have access
      const result = await fetchUserId(trimmedUsername);
      console.log('✅ Got result:', result);

      // Check if account is accessible (either public or we follow them)
      if (result.isPrivate && !result.followedByViewer) {
        console.log('❌ Account is private and not followed');
        setError('You are not following this account');
        return;
      }

      // Check if account is verified
      if (result.isVerified) {
        console.log('❌ Account is verified');
        setError('Verified accounts are not supported due to Instagram restrictions');
        return;
      }

      // Check if account has too many followers or following
      const MAX_FOLLOWERS = 3000;
      const MAX_FOLLOWING = 1000;
      if (result.followersCount > MAX_FOLLOWERS) {
        console.log('❌ Account has too many followers:', result.followersCount);
        setError('This account has too many followers. To avoid overwhelming Instagram with automated requests (which could make your account look like a bot), tracking is limited to personal accounts.');
        return;
      }
      if (result.followingCount > MAX_FOLLOWING) {
        console.log('❌ Account has too many following:', result.followingCount);
        setError('This account follows too many people. To avoid overwhelming Instagram with automated requests (which could make your account look like a bot), tracking is limited to personal accounts.');
        return;
      }

      // Register tracked account with backend first
      console.log('📝 Registering tracked account with backend');
      await addTrackedInstagram.mutateAsync({
        accountId: account.uuid,
        userId: result.userId,
        username: trimmedUsername,
      });
      console.log('✅ Tracked account registered');

      // Store userId to watch for metadata completion
      setAddedUserId(result.userId);

      // Sync just this tracked account (will auto-close when metadata is done)
      syncTrackedAccount(result.userId, trimmedUsername);
    } catch (err) {
      console.log('❌ Error:', err);
      if (err instanceof Error && err.message.includes('not found')) {
        setError('Account not found');
      } else {
        setError('Failed to add tracked account');
      }
    } finally {
      setIsLoading(false);
    }
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
      <View className="flex-1">
        <StartTracking onContinue={handleContinue} isLoading={isLoading} error={error} />
      </View>
    </View>
  );
}
