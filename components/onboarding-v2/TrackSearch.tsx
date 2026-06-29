import { useState, useEffect } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import TextField from '~/components/TextField';
import Unhinged from '~/assets/unhinged_2.svg';
import { Instagram } from '~/lib/types';
import { fetchPublicProfile } from '~/lib/fetchPublicProfile';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

function extractUsername(input: string): string {
  let value = input.trim();

  // Handle Instagram URLs: instagram.com/username or instagram.com/username/
  const urlMatch = value.match(/(?:instagram\.com)\/([a-zA-Z0-9._]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Handle @username
  if (value.startsWith('@')) {
    return value.slice(1);
  }

  return value;
}

interface TrackSearchProps {
  whoAnswer: string;
  onNext: (username: string, profile: Instagram) => void;
}

export default function TrackSearch({ whoAnswer, onNext }: TrackSearchProps) {
  const { t } = useTranslation('onboardingV2');
  const [username, setUsername] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const { track } = useAnalytics();

  const svgOpacity = useSharedValue(1);
  const svgScale = useSharedValue(1);
  const svgMarginTop = useSharedValue(0);

  const WHO_TITLES: Record<string, string> = {
    boyfriend: t('track.title.boyfriend'),
    girlfriend: t('track.title.girlfriend'),
    ex: t('track.title.ex'),
    talking_to: t('track.title.talkingTo'),
    friend: t('track.title.friend'),
    someone_else: t('track.title.someoneElse'),
  };

  const title = WHO_TITLES[whoAnswer] || t('track.title.default');

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

  const handleContinue = async () => {
    const cleaned = extractUsername(username);
    if (!cleaned) return;

    setIsSearching(true);
    setError('');

    try {
      const profile = await fetchPublicProfile(cleaned);
      track(Events.TRACK_SEARCH_COMPLETED);
      onNext(cleaned, profile);
    } catch (err) {
      setError(t('track.error.notFound'));
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
          {title}
        </Text>
        <View className="mt-8 w-full">
          <TextField
            placeholder={t('track.placeholder')}
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              setError('');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit={true}
            error={error}
          />
        </View>
        <Text className="mt-4 px-2 text-center font-roboto text-sm text-gray-600">
          {t('track.privacyNote')}
        </Text>
      </View>

      <View className="px-4 pb-8">
        <Button
          label={t('track.cta')}
          loading={isSearching}
          onPress={handleContinue}
          disabled={!username.trim()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
