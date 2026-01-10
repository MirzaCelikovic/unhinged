import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import Button from '~/components/Button';
import Onboarding from '~/components/Onboarding';
import { useOnboarding } from '~/lib/useOnboarding';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

type Screen = 'start' | 'onboarding';

export default function Start() {
  const [screen, setScreen] = useState<Screen>('start');
  const { completeOnboarding } = useOnboarding();
  const { track } = useAnalytics();

  useEffect(() => {
    track(Events.START_SCREEN_VIEWED);
  }, []);

  const openTerms = () => {
    Linking.openURL(process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL!);
  };

  const openPrivacy = () => {
    Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!);
  };

  const handleStart = () => {
    track(Events.ONBOARDING_STARTED);
    setScreen('onboarding');
  };

  const handleBack = () => {
    setScreen('start');
  };

  const handleComplete = () => {
    completeOnboarding();
    router.replace('/');
  };

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      <SafeAreaView className="flex-1">
        {screen === 'start' ? (
          <Animated.View
            key="start"
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(300)}
            className="flex-1">
            <View className="flex-1 items-center justify-center">
              <Logo width={280} height={60} />
            </View>

            <View className="px-4 pb-8">
              <Button label="Get Started" onPress={handleStart} />
              <Text className="font-roboto mt-4 px-2 text-center text-sm text-gray-600">
                By continuing, you agree with our{' '}
                <Text className="underline" onPress={openTerms}>
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text className="underline" onPress={openPrivacy}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            key="onboarding"
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(300)}
            className="flex-1">
            <Onboarding onBack={handleBack} onComplete={handleComplete} />
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}
