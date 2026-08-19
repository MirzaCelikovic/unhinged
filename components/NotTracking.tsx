import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Circles from '~/assets/circles.svg';
import Unhinged from '~/assets/unhinged_1.svg';
import Button from '~/components/Button';

export default function NotTracking() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <View className="mt-32 flex-1 items-center justify-center">
        <Unhinged width={120} height={120} />
        <Text className="font-roboto-extrablack mt-6 px-12 text-center text-4xl tracking-tighter">
          {t('notTracking.headline')}
        </Text>
        <Text className="font-roboto-regular mt-6 px-12 text-center text-lg tracking-tighter">
          {t('notTracking.subtext')}
        </Text>
      </View>
      <View className="p-4 pb-20">
        <Button label={t('notTracking.button')} onPress={() => router.push('/(tabs)/tracking/track')} />
      </View>
    </SafeAreaView>
  );
}
