import { useEffect } from 'react';
import { View, Text, Linking } from 'react-native';
import Logo from '~/assets/logo_black.svg';
import UnhingedCircle from '~/assets/unhinged_circle.svg';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface StartScreenV2Props {
  onNext: () => void;
}

const NOTIFICATIONS = [
  { title: 'Your crush', subtitle: 'started followed someone', opacity: 0.7 },
  { title: 'Your ex', subtitle: 'started following your bestie', opacity: 0.6 },
  { title: 'Your best friend', subtitle: 'just unfollowed you', opacity: 0.5 },
];

export default function StartScreenV2({ onNext }: StartScreenV2Props) {
  const { track } = useAnalytics();

  useEffect(() => {
    track(Events.START_SCREEN_VIEWED);
  }, []);

  const handleStart = () => {
    track(Events.ONBOARDING_STARTED);
    onNext();
  };

  return (
    <View className="flex-1">
      {/* Logo */}
      <View className="items-center pt-2">
        <Logo width={200} height={50} />
      </View>

      {/* Content */}
      <View className="flex-1 justify-center px-6">
        <Text className="text-center font-roboto-extrablack text-4xl text-black">
          You already know,{'\n'}don't you?
        </Text>
        <Text className="mt-4 text-center font-roboto text-lg text-black">
          Let's stop guessing and find out what's really going on.
        </Text>

        {/* Notification cards */}
        <View className="mt-10 gap-3">
          {NOTIFICATIONS.map((notification, index) => (
            <View
              key={index}
              className="flex-row items-center rounded-2xl px-4 py-3"
              style={{
                backgroundColor: `rgba(255, 255, 255, ${notification.opacity})`,
                opacity: notification.opacity,
              }}>
              <View className="mr-3">
                <UnhingedCircle width={48} height={48} />
              </View>
              <View>
                <Text className="font-roboto-bold text-base text-black">{notification.title}</Text>
                <Text className="font-roboto text-sm text-black">{notification.subtitle}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* CTA */}
      <View className="px-4 pb-8">
        <Button label="Show me what they're hiding" onPress={handleStart} />
        <Text className="mt-4 px-2 text-center font-roboto text-sm text-gray-600">
          By continuing, you agree with our{' '}
          <Text
            className="underline"
            onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL!)}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            className="underline"
            onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </View>
  );
}
