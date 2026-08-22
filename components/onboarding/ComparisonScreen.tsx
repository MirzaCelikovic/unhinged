import { View, Text } from 'react-native';
import { X, CircleCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';
import LogoBare from '~/assets/logo_bare.svg';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface ComparisonScreenProps {
  onNext: () => void;
}

const FEATURE_KEYS = [
  'onboarding.comparisonScreen.featureTrackPrivateUsers',
  'onboarding.comparisonScreen.featureEncryptedConnection',
  'onboarding.comparisonScreen.featureRedFlagBehavior',
  'onboarding.comparisonScreen.featureThirstTrapWarnings',
  'onboarding.comparisonScreen.featureFollowBackAlerts',
];

export default function ComparisonScreen({ onNext }: ComparisonScreenProps) {
  const { track } = useAnalytics();
  const { t } = useTranslation();

  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.comparisonScreen.title')}
      </Text>

      <View className="flex-1 justify-center">
        {/* Header row */}
        <View className="mb-4 flex-row items-center">
          <View className="flex-1">
            <Text className="font-roboto-bold text-xl">{t('onboarding.comparisonScreen.featureColumnHeader')}</Text>
          </View>
          <View className="w-20 items-center">
            <Text className="font-roboto-bold text-xl">{t('onboarding.comparisonScreen.otherColumnHeader')}</Text>
          </View>
          <View className="ml-6 w-20 items-center pt-1">
            <LogoBare width={80} height={24} />
          </View>
        </View>

        {/* Feature rows */}
        {FEATURE_KEYS.map((featureKey, index) => (
          <View key={index} className="flex-row items-center py-4">
            <View className="flex-1">
              <Text className="font-roboto-bold text-lg">{t(featureKey)}</Text>
            </View>
            <View className="w-20 items-center">
              <X size={22} color="#696868ff" />
            </View>
            <View className="ml-6 w-20 items-center">
              <CircleCheck size={28} color="#000000" />
            </View>
          </View>
        ))}
      </View>

      <View className="pb-8">
        <Button label={t('onboarding.comparisonScreen.cta')} onPress={() => {
          track(Events.COMPARISON_COMPLETED);
          onNext();
        }} />
      </View>
    </View>
  );
}
