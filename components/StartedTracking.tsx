import { View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import InstagramCard from '~/components/InstagramCard';
import Button from '~/components/Button';
import { useInstagram } from '~/lib/useInstagram';

interface StartedTrackingProps {
  userId: string;
  onContinue: () => void;
}

export default function StartedTracking({ userId, onContinue }: StartedTrackingProps) {
  const { t } = useTranslation('home');
  const { data: account } = useInstagram(userId);

  if (!account) {
    return null;
  }

  return (
    <View className="flex-1">
      <ScrollView className="flex-1">
        <View className="items-center justify-center p-4 pt-8">
          <InstagramCard account={account} />

          <Text className="font-roboto-extrablack mt-8 px-12 text-center text-4xl tracking-tighter">
            {t('startedTracking.heading', { username: account.username })}
          </Text>

          <Text className="font-roboto-regular mt-6 px-12 text-center text-lg tracking-tighter text-gray-600">
            {t('startedTracking.subtitle')}
          </Text>
        </View>
      </ScrollView>

      <View className="p-4 pb-12">
        <Button label={t('startedTracking.continue')} onPress={onContinue} />
      </View>
    </View>
  );
}
