import { useEffect } from 'react';
import { View, Text, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import Logo from '~/assets/logo_black.svg';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface StartScreenProps {
  onNext: () => void;
}

export default function StartScreen({ onNext }: StartScreenProps) {
  const { track } = useAnalytics();
  const { t } = useTranslation();

  useEffect(() => {
    track(Events.START_SCREEN_VIEWED);
  }, []);

  const openTerms = () => {
    Linking.openURL(process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL!);
  };

  const openPrivacy = () => {
    Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!);
  };

  const handleStart = () => {
    track(Events.ONBOARDING_STARTED);
    onNext();
  };

  return (
    <View className="flex-1">
      <View className="flex-1 items-center justify-center">
        <Logo width={280} height={60} />
      </View>

      <View className="px-4 pb-8">
        <Button label={t('onboarding.startScreen.cta')} onPress={handleStart} />
        <Text className="font-roboto mt-4 px-2 text-center text-sm text-gray-600">
          {t('onboarding.startScreen.agreementPrefix')}{' '}
          <Text className="underline" onPress={openTerms}>
            {t('onboarding.startScreen.termsOfService')}
          </Text>{' '}
          {t('onboarding.startScreen.agreementAnd')}{' '}
          <Text className="underline" onPress={openPrivacy}>
            {t('onboarding.startScreen.privacyPolicy')}
          </Text>
          {t('onboarding.startScreen.agreementSuffix')}
        </Text>
      </View>
    </View>
  );
}
