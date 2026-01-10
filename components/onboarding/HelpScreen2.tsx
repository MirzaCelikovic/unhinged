import { View, Text, Image, Dimensions } from 'react-native';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HelpScreen2Props {
  onNext: () => void;
}

export default function HelpScreen2({ onNext }: HelpScreen2Props) {
  const { track } = useAnalytics();
  return (
    <View className="flex-1">
      <Text className="mt-4 px-4 text-center font-roboto-extrablack text-4xl tracking-tighter">
        Here's how we'll help
      </Text>

      <View className="mt-8 overflow-hidden" style={{ height: 350 * 0.8 }}>
        <View className="flex-row" style={{ marginLeft: (SCREEN_WIDTH - 173) / 2 - 173 - 16 }}>
          <Image
            source={require('~/assets/onboarding_screen_2.png')}
            className="h-[350px] w-[173px] rounded-2xl"
            resizeMode="cover"
          />
          <Image
            source={require('~/assets/onboarding_screen_3.png')}
            className="mx-4 h-[350px] w-[173px] rounded-2xl"
            resizeMode="cover"
          />
          <Image
            source={require('~/assets/onboarding_screen_4.png')}
            className="h-[350px] w-[173px] rounded-2xl"
            resizeMode="cover"
          />
        </View>
      </View>

      <View className="px-4 pb-8">
        <Text className="mt-8 text-center font-roboto-extrablack text-4xl">
          See who's not following you back
        </Text>
        <Text className="font-roboto mt-2 text-center text-base text-black">
          Clean up your following and unfollow users with one tap
        </Text>
        <View className="mt-6">
          <Button label="Continue" onPress={() => {
            track(Events.HWH2_COMPLETED);
            onNext();
          }} />
        </View>
      </View>
    </View>
  );
}
