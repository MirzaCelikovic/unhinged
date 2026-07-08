import { View, Text, Pressable, Image } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface NotificationConsentProps {
  onComplete: () => void;
}

export default function NotificationConsent({ onComplete }: NotificationConsentProps) {
  const { track } = useAnalytics();
  const { t } = useTranslation();

  const handleEnableNotifications = async () => {
    await Notifications.requestPermissionsAsync();
    track(Events.NOTIFICATIONS_ACTIVATED, { activated: true });
    onComplete();
  };

  const handleSkip = () => {
    track(Events.NOTIFICATIONS_ACTIVATED, { activated: false });
    onComplete();
  };

  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.notificationConsent.title')}
      </Text>
      <Text className="font-roboto mt-3 text-center text-base text-black">
        {t('onboarding.notificationConsent.subtitle')}
      </Text>

      <Pressable className="flex-1 items-center justify-center" onPress={handleEnableNotifications}>
        <Image
          source={require('~/assets/notifications.png')}
          className="w-72"
          resizeMode="contain"
        />
      </Pressable>

      <View className="pb-8">
        <Button label={t('onboarding.notificationConsent.enableButton')} onPress={handleEnableNotifications} />

        <Pressable className="mt-4 py-3" onPress={handleSkip}>
          <Text className="text-center font-roboto-medium text-base text-black">
            {t('onboarding.notificationConsent.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
