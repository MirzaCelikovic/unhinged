import { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, Pressable, Platform } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Lock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import UnhingedCircle from '~/assets/unhinged_circle.svg';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface RevealScreenProps {
  username: string;
  profilePicUrl?: string;
  fullName?: string;
  biography?: string;
  mediaCount?: number | null;
  followingCount?: number;
  followersCount?: number;
  onNext: () => void;
}

const INSIGHT_ROWS: {
  labelKey: string;
  blurredValueKey?: string;
  locked: boolean;
}[] = [
  { labelKey: 'v2Reveal.insightNewFollowers', blurredValueKey: 'v2Reveal.insightNewFollowersValue', locked: true },
  { labelKey: 'v2Reveal.insightLastActivity', blurredValueKey: 'v2Reveal.insightLastActivityValue', locked: true },
  { labelKey: 'v2Reveal.insightFlagged', blurredValueKey: 'v2Reveal.insightFlaggedValue', locked: true },
  { labelKey: 'v2Reveal.insightMostActive', locked: false },
];

const formatCount = (count: number): string => {
  if (count >= 1_000_000) {
    return `${Math.round(count / 1_000_000)}M`;
  }
  if (count >= 10_000) {
    return `${Math.round(count / 1_000)}K`;
  }
  return count.toLocaleString();
};

export default function RevealScreen({
  username,
  profilePicUrl,
  fullName,
  biography,
  mediaCount,
  followingCount,
  followersCount,
  onNext,
}: RevealScreenProps) {
  const { isSubscribed, isHardPaywall, presentPaywall, skipLaunchPaywall } = useRevenueCat();
  const { track } = useAnalytics();
  const { t } = useTranslation();
  const [hasSeenPaywall, setHasSeenPaywall] = useState(false);

  useEffect(() => {
    track(Events.REVEAL_VIEWED);
  }, []);

  const handlePaywall = async () => {
    skipLaunchPaywall();
    track(Events.REVEAL_PAYWALL_TRIGGERED);
    const purchased = await presentPaywall('onboarding_v2_reveal');
    if (purchased) {
      track(Events.REVEAL_SUBSCRIBED);
      onNext();
    } else if (!isHardPaywall) {
      // Soft (A): reveal the "Maybe later" escape. Hard (B, COM-38): stay on the
      // reveal with the blocking CTA — no skip; onboarding can't complete without
      // a subscription (also enforced by the completion guard in start.tsx).
      setHasSeenPaywall(true);
    }
  };

  const handleRowPress = () => {
    if (isSubscribed) {
      onNext();
    } else {
      handlePaywall();
    }
  };

  const handleContinue = () => {
    if (isSubscribed) {
      onNext();
    } else {
      handlePaywall();
    }
  };

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1 px-4 pt-2"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="mb-6 text-center font-roboto-extrablack text-3xl text-black">
          {t('v2Reveal.headingPrefix')}@{username}{'\n'}{t('v2Reveal.headingSuffix')}
        </Text>

        {/* Instagram card */}
        <View className="rounded-2xl bg-white p-4">
          <View className="flex-row items-center">
            {profilePicUrl ? (
              <Image source={{ uri: profilePicUrl }} className="h-[80px] w-[80px] rounded-full" />
            ) : (
              <View className="h-[80px] w-[80px] items-center justify-center rounded-full bg-gray-200">
                <UnhingedCircle width={50} height={50} />
              </View>
            )}

            <View className="ml-8 flex-1 flex-row gap-6">
              {mediaCount !== null && mediaCount !== undefined && (
                <View className="items-center">
                  <Text className="font-roboto-bold text-2xl">{formatCount(mediaCount)}</Text>
                  <Text className="font-roboto text-sm text-gray-500">{t('v2Reveal.posts')}</Text>
                </View>
              )}
              {followingCount !== undefined && (
                <View className="items-center">
                  <Text className="font-roboto-bold text-2xl">{formatCount(followingCount)}</Text>
                  <Text className="font-roboto text-sm text-gray-500">{t('v2Reveal.following')}</Text>
                </View>
              )}
              {followersCount !== undefined && (
                <View className="items-center">
                  <Text className="font-roboto-bold text-2xl">{formatCount(followersCount)}</Text>
                  <Text className="font-roboto text-sm text-gray-500">{t('v2Reveal.followers')}</Text>
                </View>
              )}
            </View>
          </View>

          <Text className="mt-3 font-roboto-bold text-base">@{username}</Text>
          {(fullName || biography) && (
            <Text className="mt-1 font-roboto text-base text-gray-500" numberOfLines={3}>
              {biography || fullName}
            </Text>
          )}
        </View>

        {/* Insight rows */}
        <View className="mt-4 overflow-hidden rounded-2xl bg-white">
          {INSIGHT_ROWS.map((row, index) => (
            <Pressable
              key={index}
              onPress={handleRowPress}
              className={`flex-row items-center justify-between px-6 active:opacity-80 ${row.blurredValueKey ? 'py-3' : 'py-5'} ${index < INSIGHT_ROWS.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <Text className="font-roboto-medium text-base text-gray-900">{t(row.labelKey)}</Text>
              <View className="flex-row items-center gap-2">
                {row.blurredValueKey && (
                  <View className="relative overflow-hidden rounded-lg" style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                    {Platform.OS === 'android' ? (
                      <Animated.Text
                        className="font-roboto-bold text-lg text-gray-600"
                        style={{ filter: 'blur(6px)' }}>
                        {t(row.blurredValueKey)}
                      </Animated.Text>
                    ) : (
                      <>
                        <Text className="font-roboto-bold text-lg text-gray-600">{t(row.blurredValueKey)}</Text>
                        <BlurView
                          intensity={20}
                          tint="light"
                          style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4 }}
                        />
                      </>
                    )}
                  </View>
                )}
                {row.locked && <Lock size={18} color="#9ca3af" />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Red flags row */}
        <Pressable
          onPress={handleRowPress}
          className="mt-3 items-center rounded-2xl px-6 py-5 active:opacity-80"
          style={{ backgroundColor: 'rgba(255, 0, 0, 0.3)' }}>
          <Text className="font-roboto-extrablack text-base" style={{ color: '#FF0000' }}>
            {t('v2Reveal.spotRedFlags')}
          </Text>
        </Pressable>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <LinearGradient
          colors={['#FFE51F00', '#FFE51FCC']}
          style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 48 }}>
          <Button label={t('v2Reveal.showMeEverything')} onPress={handleContinue} />
          {hasSeenPaywall && !isSubscribed && !isHardPaywall && (
            <Animated.View entering={FadeIn.duration(400)}>
              <Pressable
                onPress={() => {
                  track(Events.REVEAL_MAYBE_LATER);
                  onNext();
                }}
                className="mt-3 py-2">
                <Text className="text-center font-roboto-medium text-base text-black">
                  {t('v2Reveal.maybeLater')}
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </LinearGradient>
      </View>
    </View>
  );
}
