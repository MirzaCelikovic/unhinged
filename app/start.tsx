import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import OnboardingV2 from '~/components/onboarding-v2/OnboardingV2';
import { useOnboarding } from '~/lib/useOnboarding';

export default function Start() {
  const { completeOnboarding } = useOnboarding();

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
        <OnboardingV2 onComplete={handleComplete} />
      </SafeAreaView>
    </View>
  );
}
