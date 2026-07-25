import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import { useAccountContext } from '~/contexts/AccountContext';

export default function NotificationsModal() {
  const { t } = useTranslation();
  const { account, updateAccountSettings } = useAccountContext();

  // Local state for optimistic updates
  const [localSettings, setLocalSettings] = useState({
    notification_tracked: account?.notification_tracked ?? true,
    notification_account: account?.notification_account ?? true,
    notification_marketing: account?.notification_marketing ?? true,
  });

  // Sync local state when account updates
  useEffect(() => {
    if (account) {
      setLocalSettings({
        notification_tracked: account.notification_tracked,
        notification_account: account.notification_account,
        notification_marketing: account.notification_marketing,
      });
    }
  }, [account]);

  const handleToggle = (key: keyof typeof localSettings, value: boolean) => {
    // Optimistically update local state
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    // Then update API
    updateAccountSettings({ [key]: value });
  };

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView edges={['top']}>
        <View className="flex-row items-center justify-between px-4 pb-3">
          <View className="flex-1 items-center pt-6">
            <Logo width={160} height={30} />
          </View>
          <Pressable
            className="absolute right-4 p-2 active:opacity-70"
            onPress={() => router.back()}>
            <X size={24} color="#000000" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Content */}
      <View className="flex-1 p-4">
        {/* Notifications Section */}
        <View className="mt-4">
          <Text className="mb-3 font-roboto-bold text-lg text-black">{t('notifications.title')}</Text>
          <View className="overflow-hidden rounded-2xl bg-white">
            <View className="flex-row items-center justify-between border-b border-gray-100 p-4">
              <Text className="flex-1 font-roboto-medium text-base text-gray-900">
                {t('notifications.trackedActivity')}
              </Text>
              <Switch
                value={localSettings.notification_tracked}
                onValueChange={(value) => handleToggle('notification_tracked', value)}
                trackColor={{ false: '#d1d5db', true: '#000000' }}
                thumbColor="#ffffff"
              />
            </View>
            <View className="flex-row items-center justify-between border-b border-gray-100 p-4">
              <Text className="flex-1 font-roboto-medium text-base text-gray-900">
                {t('notifications.accountActivity')}
              </Text>
              <Switch
                value={localSettings.notification_account}
                onValueChange={(value) => handleToggle('notification_account', value)}
                trackColor={{ false: '#d1d5db', true: '#000000' }}
                thumbColor="#ffffff"
              />
            </View>
            <View className="flex-row items-center justify-between p-4">
              <Text className="flex-1 font-roboto-medium text-base text-gray-900">
                {t('notifications.marketing')}
              </Text>
              <Switch
                value={localSettings.notification_marketing}
                onValueChange={(value) => handleToggle('notification_marketing', value)}
                trackColor={{ false: '#d1d5db', true: '#000000' }}
                thumbColor="#ffffff"
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
