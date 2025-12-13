import { Pressable, Text, View } from 'react-native';
import { LoaderCircle } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  fullWidth = true,
}: ButtonProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (loading) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      rotation.value = 0;
    }
  }, [loading]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`rounded-3xl bg-black px-6 py-4 active:opacity-80 ${fullWidth ? 'w-full' : ''} ${disabled || loading ? 'opacity-80' : ''}`}>
      <View className="flex-row items-center justify-center">
        {loading ? (
          <Animated.View style={animatedStyle}>
            <LoaderCircle size={20} color="#ffffff" />
          </Animated.View>
        ) : (
          <Text className="font-roboto-medium text-lg text-white">{label}</Text>
        )}
      </View>
    </Pressable>
  );
}
