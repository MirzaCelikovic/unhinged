import { View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAccountContext } from '~/contexts/AccountContext';

export default function NotificationsSettings() {
  const { account, updateAccountSettings } = useAccountContext();
  const [permissionStatus, setPermissionStatus] = useState<'undetermined' | 'granted' | 'denied' | 'loading'>('loading');
  const [notificationAccount, setNotificationAccount] = useState(account?.notification_account ?? true);
  const [notificationTracked, setNotificationTracked] = useState(account?.notification_tracked ?? true);
  const [notificationMarketing, setNotificationMarketing] = useState(account?.notification_marketing ?? true);

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  useEffect(() => {
    if (account) {
      setNotificationAccount(account.notification_account);
      setNotificationTracked(account.notification_tracked);
      setNotificationMarketing(account.notification_marketing);
    }
  }, [account]);

  const checkPermissionStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
  };

  const requestPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);
  };

  const handleToggle = async (field: string, value: boolean) => {
    // Optimistically update local state
    if (field === 'notification_account') setNotificationAccount(value);
    if (field === 'notification_tracked') setNotificationTracked(value);
    if (field === 'notification_marketing') setNotificationMarketing(value);

    try {
      await updateAccountSettings({ [field]: value });
    } catch (error) {
      // Revert on error
      if (field === 'notification_account') setNotificationAccount(!value);
      if (field === 'notification_tracked') setNotificationTracked(!value);
      if (field === 'notification_marketing') setNotificationMarketing(!value);
    }
  };

  if (permissionStatus === 'loading') {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-500">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="p-4">
        {/* Show request button if permission not determined yet */}
        {permissionStatus === 'undetermined' && (
          <View className="mt-4">
            <Text className="text-base font-medium text-gray-500 uppercase mb-3">Notifications</Text>
            <View className="bg-gray-100 rounded-2xl p-4">
              <Text className="text-base text-gray-700 mb-4">
                Enable notifications to stay updated about your Instagram followers and activity.
              </Text>
              <Pressable
                className="bg-blue-500 py-3 rounded-lg active:bg-blue-600"
                onPress={requestPermission}
              >
                <Text className="text-center font-semibold text-white">Enable Notifications</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Show settings if permission granted */}
        {permissionStatus === 'granted' && (
          <View className="mt-4">
            <Text className="text-base font-medium text-gray-500 uppercase mb-3">Notifications</Text>
            <View className="bg-gray-100 rounded-2xl overflow-hidden">
              <View className="p-4 flex-row items-center justify-between border-b border-gray-200">
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900">Account Changes</Text>
                  <Text className="text-sm text-gray-500">Notifications about your account</Text>
                </View>
                <Switch
                  value={notificationAccount}
                  onValueChange={(value) => handleToggle('notification_account', value)}
                />
              </View>
              <View className="p-4 flex-row items-center justify-between border-b border-gray-200">
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900">Tracked Accounts</Text>
                  <Text className="text-sm text-gray-500">Notifications about tracked accounts</Text>
                </View>
                <Switch
                  value={notificationTracked}
                  onValueChange={(value) => handleToggle('notification_tracked', value)}
                />
              </View>
              <View className="p-4 flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900">Marketing</Text>
                  <Text className="text-sm text-gray-500">Promotional notifications</Text>
                </View>
                <Switch
                  value={notificationMarketing}
                  onValueChange={(value) => handleToggle('notification_marketing', value)}
                />
              </View>
            </View>
          </View>
        )}

        {/* Show instructions if permission denied */}
        {permissionStatus === 'denied' && (
          <View className="mt-4">
            <Text className="text-base font-medium text-gray-500 uppercase mb-3">Notifications</Text>
            <View className="bg-gray-100 rounded-2xl p-4">
              <Text className="text-base font-medium text-gray-900 mb-2">Notifications Disabled</Text>
              <Text className="text-base text-gray-700 mb-2">
                To enable notifications, please go to:
              </Text>
              <Text className="text-base text-gray-700 ml-2">
                Settings → Unhinged → Notifications
              </Text>
              <Text className="text-base text-gray-700 mt-2">
                and turn on "Allow Notifications".
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
