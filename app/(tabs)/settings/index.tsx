import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Linking } from 'react-native';
import { useState, useEffect } from 'react';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CircleChevronRight } from 'lucide-react-native';
import { useInstagram } from '~/contexts/InstagramContext';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAccountContext } from '~/contexts/AccountContext';
import { useOnboarding } from '~/lib/useOnboarding';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import Circles from '~/assets/circles.svg';

export default function Settings() {
  const { disconnect, isLoggedIn } = useInstagram();
  const { isSubscribed, presentPaywall } = useRevenueCat();
  const { account } = useAccountContext();
  const { resetOnboarding } = useOnboarding();
  const { track } = useAnalytics();
  const [showCopied, setShowCopied] = useState(false);

  // Track screen view
  useEffect(() => {
    track(Events.SETTINGS_SCREEN_VIEWED);
  }, []);

  const handleCopyUserId = async () => {
    if (!account?.uuid) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(account.uuid);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Instagram',
      'Are you sure? Reconnecting too frequently may look like automated activity to Instagram (which could make your account look like a bot).',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: disconnect },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This action is irreversible and you will lose access to all data and insights.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // TODO: Implement account deletion
          },
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      <ScrollView className="flex-1 pt-24">
        <View className="p-4">
          {/* Settings Section */}
          <View className="mt-4">
            <Text className="mb-3 font-roboto-bold text-lg text-black">Settings</Text>
            <View className="overflow-hidden rounded-2xl bg-white">
              {!isSubscribed && (
                <Pressable
                  className="flex-row items-center justify-between border-b border-gray-100 p-4 active:opacity-80"
                  onPress={() => presentPaywall('settings_subscribe')}>
                  <Text className="font-roboto-medium text-base text-gray-900">Subscribe Now</Text>
                  <CircleChevronRight size={24} color="#9ca3af" />
                </Pressable>
              )}
              <Pressable
                className="flex-row items-center justify-between border-b border-gray-100 p-4 active:opacity-80"
                onPress={() => router.push('/(tabs)/settings/notifications')}>
                <Text className="font-roboto-medium text-base text-gray-900">Notifications</Text>
                <CircleChevronRight size={24} color="#9ca3af" />
              </Pressable>
              <Pressable
                className="flex-row items-center justify-between border-b border-gray-100 p-4 active:opacity-80"
                onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_SUPPORT_URL!)}>
                <Text className="font-roboto-medium text-base text-gray-900">Support</Text>
                <CircleChevronRight size={24} color="#9ca3af" />
              </Pressable>
              <Pressable
                className="flex-row items-center justify-between border-b border-gray-100 p-4 active:opacity-80"
                onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}>
                <Text className="font-roboto-medium text-base text-gray-900">Privacy Policy</Text>
                <CircleChevronRight size={24} color="#9ca3af" />
              </Pressable>
              <Pressable
                className="flex-row items-center justify-between p-4 active:opacity-80"
                onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL!)}>
                <Text className="font-roboto-medium text-base text-gray-900">Terms of Service</Text>
                <CircleChevronRight size={24} color="#9ca3af" />
              </Pressable>
            </View>
          </View>

          {/* Debug Section */}
          <View className="mt-4">
            <Text className="mb-3 font-roboto-bold text-lg text-black">Debug</Text>
            <View className="overflow-hidden rounded-2xl bg-white">
              <Pressable
                className="flex-row items-center justify-between p-4 active:opacity-80"
                onPress={() => {
                  resetOnboarding();
                  router.replace('/start');
                }}>
                <Text className="font-roboto-medium text-base text-gray-900">Reset Onboarding</Text>
                <CircleChevronRight size={24} color="#9ca3af" />
              </Pressable>
            </View>
          </View>

          {/* Danger Zone Section */}
          <View className="mt-4">
            <Text className="mb-3 font-roboto-bold text-lg text-black">Danger Zone</Text>
            <View className="overflow-hidden rounded-2xl bg-white">
              <Pressable
                className="flex-row items-center justify-between border-b border-gray-100 p-4 active:opacity-80"
                onPress={handleDisconnect}
                disabled={!isLoggedIn}>
                <Text
                  className={`font-roboto-medium text-base ${isLoggedIn ? 'text-error' : 'text-gray-400'}`}>
                  Disconnect Instagram
                </Text>
                <CircleChevronRight size={24} color={isLoggedIn ? '#D8514B' : '#9ca3af'} />
              </Pressable>
              <Pressable
                className="flex-row items-center justify-between p-4 active:opacity-80"
                onPress={handleDeleteAccount}>
                <Text className="font-roboto-medium text-base text-error">Delete Account</Text>
                <CircleChevronRight size={24} color="#D8514B" />
              </Pressable>
            </View>
          </View>

          {/* Version */}
          <Pressable
            className="mt-8 items-center pb-32"
            onLongPress={handleCopyUserId}
            delayLongPress={500}>
            <Text className="font-roboto-medium text-base text-gray-500">
              {showCopied
                ? 'Copied your user ID!'
                : `v${Application.nativeApplicationVersion} (${Application.nativeBuildVersion})`}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
