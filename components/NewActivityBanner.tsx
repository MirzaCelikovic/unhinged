import { View, Text, Pressable } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import Spinner from '~/components/Spinner';

interface NewActivityBannerProps {
  isSyncing: boolean;
  onRefresh: () => void;
}

export default function NewActivityBanner({ isSyncing, onRefresh }: NewActivityBannerProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const dotPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.3 }],
  }));

  return (
    <View className="mb-3 flex-row items-center justify-between rounded-2xl bg-white px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Animated.View style={dotPulseStyle} className="h-3 w-3 rounded-full bg-error" />
        <Text className="font-roboto-medium text-base text-black">
          New Instagram activity found
        </Text>
      </View>
      {isSyncing ? (
        <Spinner size={20} color="#000000" />
      ) : (
        <Pressable className="active:opacity-70" onPress={onRefresh}>
          <Text className="font-roboto-bold text-base text-black">
            Refresh
          </Text>
        </Pressable>
      )}
    </View>
  );
}
