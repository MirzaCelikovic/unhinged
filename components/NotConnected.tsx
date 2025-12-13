import { View, Text, SafeAreaView, StyleSheet } from 'react-native';
import Circles from '~/assets/circles.svg';
import Instagram from '~/assets/instagram.svg';
import Button from '~/components/Button';

interface NotConnectedProps {
  onConnect: () => void;
}

export default function NotConnected({ onConnect }: NotConnectedProps) {
  return (
    <SafeAreaView className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <View className="mt-32 flex-1 items-center justify-center">
        <Instagram width={120} height={120} />
        <Text className="font-roboto-extrablack mt-6 px-12 text-center text-5xl tracking-tighter">
          Connect your Instagram
        </Text>
        <Text className="font-roboto-regular mt-6 px-12 text-center text-lg tracking-tighter">
          Start monitoring your followers and discover who's not following you back
        </Text>
      </View>
      <View className="p-4 pb-20">
        <Button label="Connect Instagram" onPress={onConnect} />
      </View>
    </SafeAreaView>
  );
}
