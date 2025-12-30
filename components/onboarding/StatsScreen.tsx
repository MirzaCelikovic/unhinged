import { View, Text } from 'react-native';
import Button from '~/components/Button';
import LaurelTwigs from '~/assets/laurel_twigs.svg';

interface StatsScreenProps {
  onNext: () => void;
}

export default function StatsScreen({ onNext }: StatsScreenProps) {
  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        Stats to back us up
      </Text>
      <Text className="font-roboto mt-3 text-center text-base text-black">Based on 2025 data</Text>

      <View className="flex-1 items-center justify-center">
        <View className="-mt-16 items-center justify-center">
          <LaurelTwigs width={300} height={300} />
          <View className="absolute items-center">
            <Text className="font-roboto-extrablack text-4xl">400,000+</Text>
            <Text className="font-roboto text-lg text-black">Users tracked</Text>
          </View>
        </View>
      </View>

      <View className="pb-8">
        <Button label="Continue" onPress={onNext} />
      </View>
    </View>
  );
}
