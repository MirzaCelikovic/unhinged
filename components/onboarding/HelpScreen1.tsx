import { View, Text, Image, Dimensions, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HelpScreen1Props {
  onNext: () => void;
}

export default function HelpScreen1({ onNext }: HelpScreen1Props) {
  const { track } = useAnalytics();
  const { t } = useTranslation();
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
      <Text className="mt-4 px-4 text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.help1.heading')}
      </Text>

      <View className="mt-8 overflow-hidden" style={{ height: 350 * 0.8 }}>
        <View className="flex-row" style={{ paddingLeft: (SCREEN_WIDTH - 173) / 2 }}>
          <Image
            source={require('~/assets/onboarding_screen_1.png')}
            className="h-[350px] w-[173px] rounded-2xl"
            resizeMode="cover"
          />
          <Image
            source={require('~/assets/onboarding_screen_2.png')}
            className="ml-4 h-[350px] w-[173px] rounded-2xl"
            resizeMode="cover"
          />
        </View>
      </View>

      <View className="flex-1" />

      <View className="px-4 pb-8">
        <Text className="text-center font-roboto-extrablack text-4xl">{t('onboarding.help1.title')}</Text>
        <Text className="font-roboto mt-2 text-center text-base text-black">
          {t('onboarding.help1.body')}
        </Text>
        <View className="mt-6">
          <Button label={t('onboarding.help1.continue')} onPress={() => {
            track(Events.HWH1_COMPLETED);
            onNext();
          }} />
        </View>
      </View>
    </ScrollView>
  );
}
