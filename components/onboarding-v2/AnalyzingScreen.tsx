import { useState, useEffect, useRef } from 'react';
import { View, Text, Image, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Circle, CircleCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Button from '~/components/Button';
import Spinner from '~/components/Spinner';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import { useTranslation } from 'react-i18next';

const CHECKLIST = [
  'checklist.pulling',
  'checklist.mapping',
  'checklist.crossChecking',
  'checklist.matching',
  'checklist.validating',
];

const REVIEWS = [
  {
    image: require('~/assets/profile_1.jpg'),
    quoteKey: 'reviews.jake.quote',
    nameKey: 'reviews.jake.name',
  },
  {
    image: require('~/assets/profile_2.jpg'),
    quoteKey: 'reviews.taylor.quote',
    nameKey: 'reviews.taylor.name',
  },
  {
    image: require('~/assets/profile_0.jpg'),
    quoteKey: 'reviews.jess.quote',
    nameKey: 'reviews.jess.name',
  },
];

const STARS = '\u2B50\u2B50\u2B50\u2B50\u2B50';

interface AnalyzingScreenProps {
  username: string;
  onNext: () => void;
}

export default function AnalyzingScreen({ username, onNext }: AnalyzingScreenProps) {
  const { t } = useTranslation('onboardingV2');
  const { track } = useAnalytics();
  const mountedRef = useRef(true);
  const [completedItems, setCompletedItems] = useState<number>(0);
  const [redFlagsState, setRedFlagsState] = useState<'hidden' | 'spinning' | 'found'>('hidden');
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [currentReview, setCurrentReview] = useState(0);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const progressWidth = useSharedValue(0);
  const redFlagBgOpacity = useSharedValue(0);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const redFlagStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255, 0, 0, ${redFlagBgOpacity.value * 0.3})`,
  }));

  const screenWidth = Dimensions.get('window').width - 32; // px-4 padding
  const cardWidth = screenWidth; // card width + margins = snap interval

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    setCurrentReview(index);
  };

  // Main animation sequence
  useEffect(() => {
    const itemDelay = 2000; // 2s per checklist item
    const totalChecklistTime = CHECKLIST.length * itemDelay; // 10s

    // Animate progress bar across the full duration (~15s)
    progressWidth.value = withTiming(100, { duration: 15000 });

    // Complete checklist items one by one
    const timers: ReturnType<typeof setTimeout>[] = [];
    CHECKLIST.forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          if (!mountedRef.current) return;
          setCompletedItems(index + 1);
        }, (index + 1) * itemDelay)
      );
    });

    // Show spinner card after checklist
    timers.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRedFlagsState('spinning');
      }, totalChecklistTime + 500)
    );

    // Transform to RED FLAGS FOUND
    timers.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        setRedFlagsState('found');
        redFlagBgOpacity.value = withTiming(1, { duration: 400 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }, totalChecklistTime + 2500)
    );

    // Analysis complete — show continue, hide social proof
    timers.push(
      setTimeout(() => {
        if (!mountedRef.current) return;
        setAnalysisComplete(true);
        track(Events.ANALYZING_COMPLETED);
      }, totalChecklistTime + 3500)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  const review = REVIEWS[currentReview];

  return (
    <View className="flex-1">
      <View className="flex-1 px-6 pt-2">
        {/* Headline */}
        <Text className="text-center font-roboto-extrablack text-3xl text-black">
          {t('headline.analyzing', { username })}
        </Text>

        {/* Progress bar */}
        <View className="mt-4 h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)' }}>
          <Animated.View className="h-full rounded-full bg-black" style={progressStyle} />
        </View>

        {/* Checklist */}
        <View className="mt-8 gap-4">
          {CHECKLIST.map((item, index) => {
            const isCompleted = index < completedItems;
            return (
              <View key={index} className="flex-row items-start gap-3">
                {isCompleted ? (
                  <CircleCheck size={22} color="#000000" />
                ) : (
                  <Circle size={22} color="#000000" />
                )}
                <Text className="flex-1 font-roboto-medium text-base text-black">{t(item)}</Text>
              </View>
            );
          })}
        </View>

        {/* Red flags card */}
        {redFlagsState !== 'hidden' && (
          <Animated.View entering={FadeIn.duration(300)} className="mt-8">
            <Animated.View
              className="items-center justify-center rounded-2xl px-6 py-5"
              style={[
                { backgroundColor: 'rgba(255, 255, 255, 0.6)' },
                redFlagsState === 'found' ? redFlagStyle : {},
              ]}>
              {redFlagsState === 'spinning' ? (
                <Spinner size={24} color="#000000" />
              ) : (
                <Text className="font-roboto-extrablack text-lg tracking-wider" style={{ color: '#FF0000' }}>
                  {t('redFlagsFound')}
                </Text>
              )}
            </Animated.View>
          </Animated.View>
        )}
      </View>

      {/* Bottom area */}
      <View className="px-4 pb-8">
        {analysisComplete && (
          <Animated.View entering={FadeIn.duration(500)}>
            <Button label={t('continue')} onPress={onNext} />
          </Animated.View>
        )}
        {!analysisComplete && (
          <Animated.View exiting={FadeOut.duration(500)}>
            {/* Social proof carousel */}
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}>
              {REVIEWS.map((r, index) => (
                <View key={index} className="rounded-2xl bg-white p-4" style={{ width: screenWidth - 16, marginHorizontal: 8 }}>
                  <View className="flex-row items-center gap-3">
                    <Image source={r.image} className="h-12 w-12 rounded-full" />
                    <Text className="text-lg">{STARS}</Text>
                  </View>
                  <Text className="mt-2 font-roboto text-sm text-black">
                    &ldquo;{t(r.quoteKey)}&rdquo;
                  </Text>
                  <Text className="mt-1 font-roboto text-sm text-gray-500">- {t(r.nameKey)}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Dots */}
            <View className="mt-3 flex-row items-center justify-center gap-1.5">
              {REVIEWS.map((_, index) => (
                <View
                  key={index}
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: index === currentReview ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.2)',
                  }}
                />
              ))}
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
