import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useInstagram } from '~/contexts/InstagramContext';
import { useOnboarding } from '~/lib/useOnboarding';
import Circles from '~/assets/circles.svg';
import Button from '~/components/Button';

export default function Settings() {
  const { disconnect, isLoggedIn } = useInstagram();
  const { resetOnboarding } = useOnboarding();
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied' | 'loading'>('loading');

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

  const requestPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);
  };

  const isNotificationsEnabled = permissionStatus === 'granted';

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      <ScrollView className="flex-1 pt-24">
        <View className="p-4">
          {/* Settings Section */}
          <View className="mt-4">
            <Text className="mb-3 font-roboto-medium text-m text-black">Settings</Text>
            <Button
              label="Enable Push Notifications"
              onPress={requestPermission}
              disabled={isNotificationsEnabled}
            />
          </View>

          {/* Danger Zone Section */}
          <View className="mt-4 gap-3">
            <Text className="mb-3 font-roboto-medium text-m text-black">Danger Zone</Text>
            <Button
              label="Reset Onboarding"
              onPress={() => {
                resetOnboarding();
                router.replace('/start');
              }}
            />
            <Pressable
              className={`rounded-3xl px-6 py-4 active:opacity-80 ${isLoggedIn ? 'bg-error' : 'bg-gray-300'}`}
              onPress={disconnect}
              disabled={!isLoggedIn}>
              <View className="flex-row items-center justify-center">
                <Text className="font-roboto-medium text-lg text-white">Disconnect Instagram</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
