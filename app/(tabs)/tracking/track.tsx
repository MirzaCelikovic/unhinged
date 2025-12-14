import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import StartTracking from '~/components/StartTracking';
import InitialSync from '~/components/InitialSync';
import StartedTracking from '~/components/StartedTracking';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';

type TrackState = 'start' | 'syncing' | 'tracking';

export default function TrackModal() {
  const [state, setState] = useState<TrackState>('start');
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { fetchUserId } = useInstagramContext();
  const contentOpacity = useSharedValue(1);

  const handleContinue = async (inputUsername: string) => {
    setError('');

    // Validate username is not empty
    const trimmedUsername = inputUsername.trim();
    if (!trimmedUsername) {
      setError('Invalid username');
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

      // Valid account - fade out and move to syncing state
      console.log('✅ Valid account, transitioning to syncing');
      setUserId(result.userId);
      setUsername(trimmedUsername);
      contentOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) {
          runOnJS(setState)('syncing');
        }
      });
    } catch (err) {
      console.log('❌ Error fetching user:', err);
      setError('Account not found');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncComplete = async () => {
    // Transition to tracking state - data will come from context
    contentOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setState)('tracking');
      }
    });
  };

  useEffect(() => {
    if (state === 'syncing') {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: 200 });
    } else if (state === 'tracking') {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [state]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

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
      {state === 'start' && (
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          <StartTracking onContinue={handleContinue} isLoading={isLoading} error={error} />
        </Animated.View>
      )}

      {state === 'syncing' && (
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          <InitialSync userId={userId} username={username} onComplete={handleSyncComplete} />
        </Animated.View>
      )}

      {state === 'tracking' && (
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          <StartedTracking
            userId={userId}
            onContinue={() => router.back()}
          />
        </Animated.View>
      )}
    </View>
  );
}
