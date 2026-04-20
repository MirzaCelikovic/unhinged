import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import Onboarding from '~/components/Onboarding';
import OnboardingV2 from '~/components/onboarding-v2/OnboardingV2';
import { useOnboarding } from '~/lib/useOnboarding';
import { useAnalytics } from '~/contexts/AnalyticsContext';

export default function Start() {
  const { completeOnboarding } = useOnboarding();
  const { getVariant, experimentsReady } = useAnalytics();

  const handleComplete = () => {
    completeOnboarding();
    router.replace('/');
  };

  const variant = experimentsReady ? getVariant('onboarding') : undefined;

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      <SafeAreaView className="flex-1">
        {!experimentsReady ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#000000" />
          </View>
        ) : variant === 'v2' ? (
          <OnboardingV2 onComplete={handleComplete} />
        ) : (
          <Onboarding onComplete={handleComplete} />
        )}
      </SafeAreaView>
    </View>
  );
}
