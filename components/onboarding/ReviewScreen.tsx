import { View, Text, Image, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface ReviewScreenProps {
  onNext: () => void;
}

export default function ReviewScreen({ onNext }: ReviewScreenProps) {
  const { track } = useAnalytics();
  const { t } = useTranslation('onboarding');

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
      <View className="px-4">
        <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
          {t('review.title')}
        </Text>
        <Text className="font-roboto mt-3 text-center text-base text-black">
          {t('review.subtitle')}
        </Text>
      </View>

      <View className="flex-1 items-center justify-center">
        <Image
          source={require('~/assets/onboarding_reviews.png')}
          className="h-[372px] w-[345px]"
          resizeMode="contain"
        />
      </View>

      <View className="px-4 pb-8">
        <Button label={t('actions.continue')} onPress={() => {
          track(Events.REVIEW_COMPLETED);
          onNext();
        }} />
      </View>
    </ScrollView>
  );
}
