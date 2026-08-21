import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Circles from '~/assets/circles.svg';
import Instagram from '~/assets/instagram.svg';
import Button from '~/components/Button';

interface NotConnectedProps {
  onConnect: () => void;
}

export default function NotConnected({ onConnect }: NotConnectedProps) {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <View className="mt-32 flex-1 items-center justify-center">
        <Instagram width={120} height={120} />
        <Text className="mt-6 px-12 text-center font-roboto-extrablack text-4xl tracking-tighter">
          {t('notConnected.title')}
        </Text>
        <Text className="font-roboto mt-6 px-12 text-center text-lg tracking-tighter">
          {t('notConnected.subtitle')}
        </Text>
      </View>
      <View className="p-4 pb-20">
        <Button label={t('notConnected.connectButton')} onPress={onConnect} />
      </View>
    </SafeAreaView>
  );
}
