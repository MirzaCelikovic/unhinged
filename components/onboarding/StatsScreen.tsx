import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import LaurelTwigs from '~/assets/laurel_twigs.svg';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface StatsScreenProps {
  onNext: () => void;
}

export default function StatsScreen({ onNext }: StatsScreenProps) {
  const { track } = useAnalytics();
  const { t } = useTranslation();

  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.statsScreen.title')}
      </Text>
      <Text className="font-roboto mt-3 text-center text-base text-black">{t('onboarding.statsScreen.subtitle')}</Text>

      <View className="flex-1 items-center justify-center">
        <View className="-mt-16 items-center justify-center">
          <LaurelTwigs width={300} height={300} />
          <View className="absolute items-center">
            <Text className="font-roboto-extrablack text-4xl">{t('onboarding.statsScreen.statValue')}</Text>
            <Text className="font-roboto text-lg text-black">{t('onboarding.statsScreen.statLabel')}</Text>
          </View>
        </View>
      </View>

      <View className="pb-8">
        <Button label={t('onboarding.statsScreen.cta')} onPress={() => {
          track(Events.STATS_COMPLETED);
          onNext();
        }} />
      </View>
    </View>
  );
}
