import { View, Text, Pressable, Image } from 'react-native';
import * as Notifications from 'expo-notifications';
import Button from '~/components/Button';

interface NotificationConsentProps {
  onComplete: () => void;
}

export default function NotificationConsent({ onComplete }: NotificationConsentProps) {
  const handleEnableNotifications = async () => {
    await Notifications.requestPermissionsAsync();
    onComplete();
  };

  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        Don't miss out on{'\n'}what's happening
      </Text>
      <Text className="font-roboto mt-3 text-center text-base text-black">
        Get notified when someone unfollows you and more
      </Text>

      <View className="flex-1 items-center justify-center">
        <Image
          source={require('~/assets/notifications.png')}
          className="w-72"
          resizeMode="contain"
        />
      </View>

      <View className="pb-8">
        <Button label="Stay up to date" onPress={handleEnableNotifications} />

        <Pressable className="mt-4 py-3" onPress={onComplete}>
          <Text className="text-center font-roboto-medium text-base text-black">
            I don't want to stay updated
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
