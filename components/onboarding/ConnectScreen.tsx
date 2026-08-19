import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LockKeyhole, Shield, FolderCheck, EyeOff } from 'lucide-react-native';
import IgGradient from '~/assets/ig_gradient.svg';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface ConnectScreenProps {
  onConnect: () => void;
  onSkip: () => void;
}

export default function ConnectScreen({ onConnect, onSkip }: ConnectScreenProps) {
  const { t } = useTranslation();
  const { track } = useAnalytics();
  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.connect.headline')}
      </Text>
      <View className="mt-3 flex-row items-center justify-center">
        <LockKeyhole size={16} color="#000000" />
        <Text className="font-roboto ml-2 text-center text-base text-black">
          {t('onboarding.connect.secure')}
        </Text>
      </View>

      <View className="mt-10 flex-1">
        <View className="mb-8 flex-row">
          <Shield size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">{t('onboarding.connect.bankSecurity.title')}</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              {t('onboarding.connect.bankSecurity.body')}
            </Text>
          </View>
        </View>

        <View className="mb-8 flex-row">
          <FolderCheck size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">{t('onboarding.connect.secureLocal.title')}</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              {t('onboarding.connect.secureLocal.body')}
            </Text>
          </View>
        </View>

        <View className="flex-row">
          <EyeOff size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">{t('onboarding.connect.discreet.title')}</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              {t('onboarding.connect.discreet.body')}
            </Text>
          </View>
        </View>
      </View>

      <View className="pb-8">
        <Pressable onPress={onConnect} className="w-full overflow-hidden rounded-3xl active:opacity-80">
          <View className="items-center justify-center">
            <IgGradient width="100%" height={56} preserveAspectRatio="none" />
            <Text className="absolute font-roboto-medium text-lg text-white">{t('onboarding.connect.button')}</Text>
          </View>
        </Pressable>
        <Pressable className="mt-4 py-3" onPress={() => {
          track(Events.INSTAGRAM_CONNECTED_ONBOARDING, { connected: false });
          onSkip();
        }}>
          <Text className="text-center font-roboto-medium text-base text-black">{t('onboarding.connect.skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
