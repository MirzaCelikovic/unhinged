import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import LaurelTwigs from '~/assets/laurel_twigs.svg';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface StatsScreenProps {
  onNext: () => void;
}

export default function StatsScreen({ onNext }: StatsScreenProps) {
  const { t } = useTranslation();
  const { track } = useAnalytics();

  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.stats.headline')}
      </Text>
      <Text className="font-roboto mt-3 text-center text-base text-black">{t('onboarding.stats.subtext')}</Text>

      <View className="flex-1 items-center justify-center">
        <View className="-mt-16 items-center justify-center">
          <LaurelTwigs width={300} height={300} />
          <View className="absolute items-center">
            <Text className="font-roboto-extrablack text-4xl">400,000+</Text>
            <Text className="font-roboto text-lg text-black">{t('onboarding.stats.metric')}</Text>
          </View>
        </View>
      </View>

      <View className="pb-8">
        <Button label={t('onboarding.stats.continue')} onPress={() => {
          track(Events.STATS_COMPLETED);
          onNext();
        }} />
      </View>
    </View>
  );
}
