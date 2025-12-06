import { View, Text, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Unhinged from '~/assets/unhinged_2.svg';
import Button from '~/components/Button';
import TextField from '~/components/TextField';

interface StartTrackingProps {
  onContinue: (username: string) => void;
  isLoading: boolean;
  error: string;
}

export default function StartTracking({ onContinue, isLoading, error }: StartTrackingProps) {
  const [username, setUsername] = useState('');
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1">
      <View className="flex-1 items-center justify-center p-4">
        <Animated.View style={svgAnimatedStyle}>
          <Unhinged width={120} height={120} />
        </Animated.View>
        <Text className="font-roboto-extrablack mt-6 px-2 text-center text-4xl tracking-tighter">
          Who do you want to track?
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
        <Text className="font-roboto-regular mt-4 px-2 text-center text-sm text-gray-600">
          Note: The profile must be public or you currently follow them. This action is private
          and they will not be notified.
        </Text>
        <View className="mt-6 w-full">
          <Button
            label="Continue"
            mode="next"
            loading={isLoading}
            onPress={() => onContinue(username)}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
