import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CircleChevronLeft } from 'lucide-react-native';
import { useSQLiteContext } from 'expo-sqlite';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import StartTracking from '~/components/StartTracking';
import TrackConfirm from '~/components/TrackConfirm';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';
import { useAccountContext } from '~/contexts/AccountContext';
import { useAddTrackedInstagram } from '~/lib/useInstagram';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import { fetchPublicProfile } from '~/lib/fetchPublicProfile';
import { Instagram } from '~/lib/types';
import { FOLLOWERS_WARN_THRESHOLD, FOLLOWING_WARN_THRESHOLD } from '~/lib/constants';

type TrackStep = 'search' | 'confirm';

export default function TrackModal() {
  const { t } = useTranslation('tracking');
  const [step, setStep] = useState<TrackStep>('search');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [addedUserId, setAddedUserId] = useState<string | null>(null);
  const { fetchUserId, syncTrackedAccount, syncState, isCoolingDown } = useInstagramContext();
  const { account } = useAccountContext();
  const addTrackedInstagram = useAddTrackedInstagram();
  const { track } = useAnalytics();
  const db = useSQLiteContext();

  // Found account data for confirm screen
  const [foundProfile, setFoundProfile] = useState<Instagram | null>(null);
  const [foundUserId, setFoundUserId] = useState<string | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Sync toggle state
  const [trackFollowing, setTrackFollowing] = useState(true);
  const [trackFollowers, setTrackFollowers] = useState(true);

  // Auto-close modal once metadata is fetched (or errored) for the added account
  useEffect(() => {
    if (!addedUserId) return;

    const trackedAccount = syncState.trackedAccounts.find((acc) => acc.userId === addedUserId);
    if (trackedAccount?.metadata === 'complete' || trackedAccount?.metadata === 'error') {
      // Close on both complete and error — error means the sync will show an error
      // state on the tracking screen, but we don't want the modal to hang.
      router.back();
    }
  }, [addedUserId, syncState.trackedAccounts]);

  const handleContinue = async (inputUsername: string) => {
    setError('');

    const trimmedUsername = inputUsername.trim();
    if (!trimmedUsername) {
      setError(t('errors.invalidUsername'));
      return;
    }

    if (!account?.uuid) {
      setError(t('errors.accountNotReady'));
      return;
    }

    setIsLoading(true);

    try {
      console.log('🔍 Fetching user ID for:', trimmedUsername);
      const result = await fetchUserId(trimmedUsername);
      console.log('✅ Got result:', result);

      // Check if account is accessible
      if (result.isPrivate && !result.followedByViewer) {
        console.log('❌ Account is private and not followed');
        setError(t('errors.notFollowing'));
        return;
      }

      // Check if account is verified
      if (result.isVerified) {
        console.log('❌ Account is verified');
        setError(t('errors.verifiedNotSupported'));
        return;
      }

      // Fetch full profile for the confirmation card
      let profile: Instagram;
      try {
        profile = await fetchPublicProfile(trimmedUsername);
      } catch {
        // Fallback: construct minimal profile from fetchUserId result
        profile = {
          user_id: result.userId,
          username: trimmedUsername,
          followers_count: result.followersCount,
          following_count: result.followingCount,
        };
      }

      // Set toggle defaults based on thresholds
      setTrackFollowing(result.followingCount < FOLLOWING_WARN_THRESHOLD);
      setTrackFollowers(result.followersCount < FOLLOWERS_WARN_THRESHOLD);

      setFoundProfile(profile);
      setFoundUserId(result.userId);
      setFollowersCount(result.followersCount);
      setFollowingCount(result.followingCount);
      setStep('confirm');
    } catch (err) {
      console.log('❌ Error:', err);
      if (err instanceof Error && err.message.includes('not found')) {
        setError(t('errors.accountNotFound'));
      } else {
        setError(t('errors.lookupFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTracking = async () => {
    if (!foundProfile || !foundUserId || !account?.uuid) return;

    setIsLoading(true);

    try {
      // Register with backend
      console.log('📝 Registering tracked account with backend');
      await addTrackedInstagram.mutateAsync({
        accountId: account.uuid,
        userId: foundUserId,
        username: foundProfile.username,
      });
      console.log('✅ Tracked account registered');
      track(Events.ACCOUNT_TRACKED);

      // Set sync preferences in SQLite before starting sync
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO sync_state (instagram_user_id, followers_sync_disabled, following_sync_disabled, date_created, date_updated)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(instagram_user_id) DO UPDATE SET
           followers_sync_disabled = ?, following_sync_disabled = ?, date_updated = ?`,
        [
          foundUserId,
          trackFollowers ? 0 : 1,
          trackFollowing ? 0 : 1,
          now,
          now,
          trackFollowers ? 0 : 1,
          trackFollowing ? 0 : 1,
          now,
        ]
      );

      // If the circuit-breaker cooldown is active, skip the sync and close the
      // modal — the account is already registered in the backend/DB and will sync
      // on the next manual refresh once the cooldown expires.
      if (isCoolingDown) {
        Alert.alert(t('paused.title'), t('paused.message'));
        router.back();
        return;
      }

      // Store userId to watch for metadata completion
      setAddedUserId(foundUserId);

      // Start sync with appropriate flags
      syncTrackedAccount(foundUserId, foundProfile.username, {
        skipFollowing: !trackFollowing,
        skipFollowers: !trackFollowers,
      });
    } catch (err) {
      console.log('❌ Error:', err);
      setError(t('errors.addFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFollowing = (value: boolean) => {
    setTrackFollowing(value);
  };

  const handleToggleFollowers = (value: boolean) => {
    setTrackFollowers(value);
  };

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View className="flex-row items-center justify-between px-4 pb-3">
          {step === 'confirm' ? (
            <Pressable
              className="absolute left-4 z-10 p-2 active:opacity-70"
              onPress={() => setStep('search')}>
              <CircleChevronLeft size={24} color="#000000" />
            </Pressable>
          ) : null}
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
        {step === 'search' ? (
          <StartTracking onContinue={handleContinue} isLoading={isLoading} error={error} />
        ) : foundProfile ? (
          <TrackConfirm
            profile={foundProfile}
            followersCount={followersCount}
            followingCount={followingCount}
            trackFollowing={trackFollowing}
            trackFollowers={trackFollowers}
            onToggleFollowing={handleToggleFollowing}
            onToggleFollowers={handleToggleFollowers}
            onStartTracking={handleStartTracking}
            isLoading={isLoading}
          />
        ) : null}
      </View>
    </View>
  );
}
