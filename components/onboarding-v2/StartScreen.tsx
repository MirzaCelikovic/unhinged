import { useEffect } from 'react';
import { View, Text, Linking } from 'react-native';
import { useTranslation, Trans } from 'react-i18next';
import Logo from '~/assets/logo_black.svg';
import UnhingedCircle from '~/assets/unhinged_circle.svg';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface StartScreenV2Props {
  onNext: () => void;
}

export default function StartScreenV2({ onNext }: StartScreenV2Props) {
  const { t } = useTranslation('onboardingV2');
  const { track } = useAnalytics();

  const NOTIFICATIONS = [
    { title: t('start.notifications.crush.title'), subtitle: t('start.notifications.crush.subtitle'), opacity: 0.7 },
    { title: t('start.notifications.ex.title'), subtitle: t('start.notifications.ex.subtitle'), opacity: 0.6 },
    { title: t('start.notifications.bestFriend.title'), subtitle: t('start.notifications.bestFriend.subtitle'), opacity: 0.5 },
  ];

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
      <View className="items-center pt-6">
        <Logo width={200} height={50} />
      </View>

      {/* Content */}
      <View className="flex-1 justify-center px-6">
        <Text className="text-center font-roboto-extrablack text-4xl text-black">
          {t('start.headline')}
        </Text>
        <Text className="mt-4 text-center font-roboto text-lg text-black">
          {t('start.subtitle')}
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
        <Button label={t('start.cta')} onPress={handleStart} />
        <Text className="mt-4 px-2 text-center font-roboto text-sm text-gray-600">
          <Trans
            i18nKey="legal.terms"
            ns="onboardingV2"
            components={{
              terms: (
                <Text
                  className="underline"
                  onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL!)}
                />
              ),
              privacy: (
                <Text
                  className="underline"
                  onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}
                />
              ),
            }}
          />
        </Text>
      </View>
    </View>
  );
}
