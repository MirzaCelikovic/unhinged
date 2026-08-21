import { View, Text, Pressable } from 'react-native';
import { LockKeyhole, Shield, FolderCheck, EyeOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import IgGradient from '~/assets/ig_gradient.svg';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';

interface ConnectScreenProps {
  onConnect: () => void;
  onSkip: () => void;
}

export default function ConnectScreen({ onConnect, onSkip }: ConnectScreenProps) {
  const { track } = useAnalytics();
  const { t } = useTranslation();
  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('onboarding.connectScreen.title')}
      </Text>
      <View className="mt-3 flex-row items-center justify-center">
        <LockKeyhole size={16} color="#000000" />
        <Text className="font-roboto ml-2 text-center text-base text-black">
          {t('onboarding.connectScreen.secureSubtitle')}
        </Text>
      </View>

      <View className="mt-10 flex-1">
        <View className="mb-8 flex-row">
          <Shield size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">{t('onboarding.connectScreen.bankLevelSecurityTitle')}</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              {t('onboarding.connectScreen.bankLevelSecurityBody')}
            </Text>
          </View>
        </View>

        <View className="mb-8 flex-row">
          <FolderCheck size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">{t('onboarding.connectScreen.secureAndLocalTitle')}</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              {t('onboarding.connectScreen.secureAndLocalBody')}
            </Text>
          </View>
        </View>

        <View className="flex-row">
          <EyeOff size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">{t('onboarding.connectScreen.discreetAndPrivateTitle')}</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              {t('onboarding.connectScreen.discreetAndPrivateBody')}
            </Text>
          </View>
        </View>
      </View>

      <View className="pb-8">
        <Pressable onPress={onConnect} className="w-full overflow-hidden rounded-3xl active:opacity-80">
          <View className="items-center justify-center">
            <IgGradient width="100%" height={56} preserveAspectRatio="none" />
            <Text className="absolute font-roboto-medium text-lg text-white">{t('onboarding.connectScreen.connectButton')}</Text>
          </View>
        </Pressable>
        <Pressable className="mt-4 py-3" onPress={() => {
          track(Events.INSTAGRAM_CONNECTED_ONBOARDING, { connected: false });
          onSkip();
        }}>
          <Text className="text-center font-roboto-medium text-base text-black">{t('onboarding.connectScreen.skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
