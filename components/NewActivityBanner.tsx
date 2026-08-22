import { View, Text, Pressable } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import Spinner from '~/components/Spinner';

interface NewActivityBannerProps {
  isSyncing: boolean;
  onRefresh: () => void;
}

export default function NewActivityBanner({ isSyncing, onRefresh }: NewActivityBannerProps) {
  const { t } = useTranslation();
  const sonar = useSharedValue(0);

  useEffect(() => {
    sonar.value = withRepeat(
      withTiming(1, { duration: 1500 }),
      -1,
      false
    );
  }, []);

  const sonarRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + sonar.value * 2 }],
    opacity: 1 - sonar.value,
  }));

  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-white px-4 py-3">
      <View className="flex-row items-center gap-3">
        <View className="h-5 w-5 items-center justify-center">
          <Animated.View
            style={sonarRingStyle}
            className="absolute h-3 w-3 rounded-full bg-error"
          />
          <View className="h-3 w-3 rounded-full bg-error" />
        </View>
        <Text className="font-roboto-medium text-base text-black">
          {t('newActivityBanner.newActivityFound')}
        </Text>
      </View>
      {isSyncing ? (
        <Spinner size={20} color="#000000" />
      ) : (
        <Pressable className="active:opacity-70" onPress={onRefresh}>
          <Text className="font-roboto-bold text-base text-black">
            {t('newActivityBanner.refresh')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
