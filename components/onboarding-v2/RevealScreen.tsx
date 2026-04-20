import { useState } from 'react';
import { View, Text, Image, ScrollView, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Lock } from 'lucide-react-native';
import Button from '~/components/Button';
import UnhingedCircle from '~/assets/unhinged_circle.svg';
import { useRevenueCat } from '~/contexts/RevenueCatContext';

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

const INSIGHT_ROWS = [
  { label: 'New followers this week', blurredValue: '24', locked: true },
  { label: 'Last activity', blurredValue: '3 hours ago', locked: true },
  { label: 'Accounts flagged as unusual', blurredValue: '18', locked: true },
  { label: 'Most active late at night', locked: false },
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
  const { isSubscribed, presentPaywall, skipLaunchPaywall } = useRevenueCat();
  const [hasSeenPaywall, setHasSeenPaywall] = useState(false);

  const handlePaywall = async () => {
    skipLaunchPaywall();
    const purchased = await presentPaywall('onboarding_v2_reveal');
    if (purchased) {
      onNext();
    } else {
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
      <ScrollView className="flex-1 px-4 pt-2" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="mb-6 text-center font-roboto-extrablack text-3xl text-black">
          Here&apos;s what we found on{'\n'}@{username}
        </Text>

        {/* Instagram card */}
        <View className="rounded-2xl bg-white p-4">
          <View className="flex-row items-center">
            {profilePicUrl ? (
              <Image
                source={{ uri: profilePicUrl }}
                className="h-[80px] w-[80px] rounded-full"
              />
            ) : (
              <View className="h-[80px] w-[80px] items-center justify-center rounded-full bg-gray-200">
                <UnhingedCircle width={50} height={50} />
              </View>
            )}

            <View className="ml-8 flex-1 flex-row gap-6">
              {mediaCount !== null && mediaCount !== undefined && (
                <View className="items-center">
                  <Text className="font-roboto-bold text-2xl">{formatCount(mediaCount)}</Text>
                  <Text className="font-roboto text-sm text-gray-500">posts</Text>
                </View>
              )}
              {followingCount !== undefined && (
                <View className="items-center">
                  <Text className="font-roboto-bold text-2xl">{formatCount(followingCount)}</Text>
                  <Text className="font-roboto text-sm text-gray-500">following</Text>
                </View>
              )}
              {followersCount !== undefined && (
                <View className="items-center">
                  <Text className="font-roboto-bold text-2xl">{formatCount(followersCount)}</Text>
                  <Text className="font-roboto text-sm text-gray-500">followers</Text>
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
              className={`flex-row items-center justify-between px-6 active:opacity-80 ${row.blurredValue ? 'py-3' : 'py-5'} ${index < INSIGHT_ROWS.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <Text className="font-roboto-medium text-base text-gray-900">
                {row.label}
              </Text>
              <View className="flex-row items-center gap-2">
                {row.blurredValue && (
                  <View className="relative overflow-hidden rounded-lg" style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                    <Text className="font-roboto-bold text-lg text-gray-600">{row.blurredValue}</Text>
                    <BlurView intensity={20} tint="light" style={{ position: 'absolute', top: -4, left: -4, right: -4, bottom: -4 }} />
                  </View>
                )}
                {row.locked && (
                  <Lock size={18} color="#9ca3af" />
                )}
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
            RED FLAGS FOUND
          </Text>
        </Pressable>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <LinearGradient
          colors={['#FFE51F00', '#FFE51FCC']}
          style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 48 }}>
          <Button label="Show me everything" onPress={handleContinue} />
          {hasSeenPaywall && !isSubscribed && (
            <Animated.View entering={FadeIn.duration(400)}>
              <Pressable onPress={onNext} className="mt-3 py-2">
                <Text className="text-center font-roboto-medium text-base text-black">
                  Maybe later
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </LinearGradient>
      </View>
    </View>
  );
}
