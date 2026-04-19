import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Circles from '~/assets/circles.svg';
import Onboarding from '~/components/Onboarding';
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
        <Onboarding onComplete={handleComplete} />
      </SafeAreaView>
    </View>
  );
}
