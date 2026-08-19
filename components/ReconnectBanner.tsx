import { View, Text, Pressable } from 'react-native';
import { CircleChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

interface ReconnectBannerProps {
  onReconnect: () => void;
}

/**
 * Persistent, tappable banner shown when the Instagram session has expired but the
 * user's previously-synced data is still on-device. It sits above the dashboard so the
 * user keeps seeing their data and can reconnect whenever they like — never a dead-end
 * wall. Disappears automatically once the session is restored (sessionExpired flips false).
 *
 * Styled to match the app's other status banners (see NewActivityBanner): white
 * rounded card, black text, red attention dot.
 */
export default function ReconnectBanner({ onReconnect }: ReconnectBannerProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onReconnect}
      className="mb-3 flex-row items-center justify-between rounded-2xl bg-white px-4 py-3 active:opacity-80">
      <View className="mr-3 flex-1 flex-row items-center gap-3">
        <View className="h-3 w-3 rounded-full bg-error" />
        <View className="flex-1">
          <Text className="font-roboto-bold text-base text-black">{t('reconnectBanner.sessionExpired')}</Text>
          <Text className="font-roboto-medium text-sm text-gray-500">
            {t('reconnectBanner.subtitle')}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="font-roboto-bold text-base text-black">{t('reconnectBanner.reconnect')}</Text>
        <CircleChevronRight size={20} color="#000000" />
      </View>
    </Pressable>
  );
}
