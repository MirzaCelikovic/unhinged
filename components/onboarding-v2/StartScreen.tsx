import { useEffect } from 'react';
import { View, Text, Linking } from 'react-native';
import Logo from '~/assets/logo_black.svg';
import UnhingedCircle from '~/assets/unhinged_circle.svg';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface StartScreenV2Props {
  onNext: () => void;
}

const NOTIFICATIONS = [
  { titleKey: 'v2Start.notification1Title', subtitleKey: 'v2Start.notification1Subtitle', opacity: 0.7 },
  { titleKey: 'v2Start.notification2Title', subtitleKey: 'v2Start.notification2Subtitle', opacity: 0.6 },
  { titleKey: 'v2Start.notification3Title', subtitleKey: 'v2Start.notification3Subtitle', opacity: 0.5 },
];

export default function StartScreenV2({ onNext }: StartScreenV2Props) {
  const { track } = useAnalytics();
  const { t } = useTranslation();

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
          {t('v2Start.headline')}
        </Text>
        <Text className="mt-4 text-center font-roboto text-lg text-black">
          {t('v2Start.subheadline')}
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
                <Text className="font-roboto-bold text-base text-black">{t(notification.titleKey)}</Text>
                <Text className="font-roboto text-sm text-black">{t(notification.subtitleKey)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* CTA */}
      <View className="px-4 pb-8">
        <Button label={t('v2Start.cta')} onPress={handleStart} />
        <Text className="mt-4 px-2 text-center font-roboto text-sm text-gray-600">
          {t('v2Start.agreePrefix')}{' '}
          <Text
            className="underline"
            onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL!)}>
            {t('v2Start.termsOfService')}
          </Text>{' '}
          {t('v2Start.and')}{' '}
          <Text
            className="underline"
            onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}>
            {t('v2Start.privacyPolicy')}
          </Text>
          {t('v2Start.agreeSuffix')}
        </Text>
      </View>
    </View>
  );
}
