import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Instagram } from '~/lib/types';
import { fetchPublicProfile } from '~/lib/fetchPublicProfile';
import InstagramCard from '~/components/InstagramCard';
import Button from '~/components/Button';
import TextField from '~/components/TextField';
import Unhinged from '~/assets/unhinged_2.svg';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

const FAKE_ACCOUNTS = [
  {
    id: '1',
    username: 'sarah_designs',
    image: require('~/assets/profile_0.jpg'),
    time: '2 hours ago',
  },
  {
    id: '2',
    username: 'mike.travels',
    image: require('~/assets/profile_1.jpg'),
    time: '5 hours ago',
  },
  {
    id: '3',
    username: 'emma_fitness',
    image: require('~/assets/profile_2.jpg'),
    time: 'Yesterday',
  },
];

interface UsernameSearchProps {
  onNext: (username: string | null) => void;
  savedResult: Instagram | null;
  onResultFetched: (result: Instagram) => void;
}

export default function UsernameSearch({
  onNext,
  savedResult,
  onResultFetched,
}: UsernameSearchProps) {
  const [username, setUsername] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const { track } = useAnalytics();

  const svgOpacity = useSharedValue(1);
  const svgScale = useSharedValue(1);
  const svgMarginTop = useSharedValue(0);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        svgOpacity.value = withTiming(0, { duration: 250 });
        svgScale.value = withTiming(0.8, { duration: 250 });
        svgMarginTop.value = withTiming(-220, { duration: 250 });
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        svgOpacity.value = withTiming(1, { duration: 250 });
        svgScale.value = withTiming(1, { duration: 250 });
        svgMarginTop.value = withTiming(0, { duration: 250 });
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  const svgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: svgOpacity.value,
    marginTop: svgMarginTop.value,
    transform: [{ scale: svgScale.value }],
  }));

  // If we have a saved result, show the result view
  if (savedResult) {
    return (
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="mb-8 text-center font-roboto-black text-4xl">What we found</Text>

        <InstagramCard account={savedResult} />

        <Text className="mb-3 mt-6 font-roboto-medium text-lg text-black">
          Not following you back
        </Text>

        <View className="gap-3">
          {FAKE_ACCOUNTS.map((account) => (
            <View key={account.id} className="overflow-hidden rounded-2xl">
              <View className="flex-row items-center gap-3 bg-white p-4">
                <View className="relative h-12 w-12 overflow-hidden rounded-full">
                  <Image source={account.image} className="h-12 w-12 rounded-full" />
                  <BlurView
                    intensity={20}
                    tint="light"
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                  />
                </View>
                <View className="flex-1 justify-center">
                  <View className="h-4 w-32 rounded bg-gray-300" />
                </View>
              </View>
            </View>
          ))}
        </View>

        <View className="mt-8">
          <Button label="Continue" onPress={() => {
            track(Events.USERNAME_RESULT_COMPLETED);
            onNext(savedResult.username);
          }} />
        </View>
      </ScrollView>
    );
  }

  const handleContinue = async () => {
    const cleaned = username.trim().replace(/^@/, '').match(/(?:instagram\.com)\/([a-zA-Z0-9._]+)/)?.[1] || username.trim().replace(/^@/, '');
    if (!cleaned) return;

    setIsSearching(true);
    setError('');

    try {
      const profile = await fetchPublicProfile(cleaned);
      track(Events.USERNAME_SEARCH_COMPLETED);
      onResultFetched(profile);
    } catch (err) {
      setError('Could not find this account. Please check the username.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1">
      <View className="flex-1 items-center justify-center px-4">
        <Animated.View style={svgAnimatedStyle}>
          <Unhinged width={140} height={140} />
        </Animated.View>
        <Text className="mt-6 px-2 text-center font-roboto-extrablack text-4xl tracking-tighter">
          What's your Instagram username?
        </Text>
        <View className="mt-8 w-full">
          <TextField
            placeholder="Instagram username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
          />
        </View>
        <View className="mt-6 w-full">
          <Button
            label="Continue"
            loading={isSearching}
            onPress={handleContinue}
            disabled={!username.trim()}
          />
        </View>
        <Pressable className="mt-4 py-3" onPress={() => {
          track(Events.USERNAME_SEARCH_SKIPPED);
          onNext(null);
        }}>
          <Text className="text-center font-roboto-medium text-base text-black">Skip</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
