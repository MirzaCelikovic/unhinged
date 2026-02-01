import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import Logo from '~/assets/logo_black.svg';
import { useCallback, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { CustomerIO } from 'customerio-reactnative';
import { useAccountContext } from '~/contexts/AccountContext';
import {
  useInstagram as useInstagramContext,
  AccountSyncStatus,
} from '~/contexts/InstagramContext';
import { CircleChevronRight } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import NotConnected from '~/components/NotConnected';
import NotTracking from '~/components/NotTracking';
import NotificationsSheet from '~/components/NotificationsSheet';
import Button from '~/components/Button';
import Spinner from '~/components/Spinner';
import { Instagram } from '~/lib/types';
import { useInstagramActivity } from '~/lib/useInstagramActivity';
import { useFollowerStats } from '~/lib/useFollowerStats';
import { useRevenueCat } from '~/contexts/RevenueCatContext';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import NewActivityBanner from '~/components/NewActivityBanner';

const NOTIFICATIONS_LATER_KEY = 'notifications_sheet_dismissed_at';
const NOTIFICATIONS_LATER_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_TRACKED_ACCOUNTS = 5;

interface TrackedAccountItemProps {
  account: Instagram;
  syncStatus: AccountSyncStatus | undefined;
}

function TrackedAccountItem({ account, syncStatus }: TrackedAccountItemProps) {
  const { data: activity } = useInstagramActivity(account.user_id);
  const { isSubscribed } = useRevenueCat();

  // Check if this account is still syncing
  const isSyncing =
    syncStatus &&
    (syncStatus.metadata === 'syncing' ||
      syncStatus.following === 'syncing' ||
      syncStatus.followers === 'syncing');

  // Show indicator if not subscribed or if there's actual new activity
  const showIndicator = !isSubscribed || activity.hasNewActivity;

  return (
    <Pressable
      className="flex-row items-center justify-between rounded-3xl bg-gray-100 p-4 active:opacity-50"
      onPress={() =>
        router.push({
          pathname: '/(tabs)/tracking/account',
          params: { userId: account.user_id },
        })
      }>
      <View className="flex-row items-center gap-3">
        {account.profile_pic_url ? (
          <Image
            source={{ uri: account.profile_pic_url }}
            className="h-[60px] w-[60px] rounded-full"
          />
        ) : (
          <View className="h-[60px] w-[60px] rounded-full bg-gray-300" />
        )}
        <View>
          <Text className="font-roboto-bold text-xl text-gray-900">@{account.username}</Text>
          {account.full_name && (
            <Text className="font-roboto-regular text-sm text-gray-500">{account.full_name}</Text>
          )}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {isSyncing ? (
          <Spinner size={24} color="#6b7280" />
        ) : (
          <>
            {showIndicator && <View className="h-3 w-3 rounded-full bg-error" />}
            <CircleChevronRight size={24} color="black" />
          </>
        )}
      </View>
    </Pressable>
  );
}

export default function Tracking() {
  const { trackedInstagrams, isLoading, account } = useAccountContext();
  const { isLoggedIn, showLogin, syncState, userId, sync } = useInstagramContext();
  const { data: stats, hasNewActivity } = useFollowerStats(userId, account?.latest_activity_date);
  const { track } = useAnalytics();
  const notificationsSheetRef = useRef<BottomSheetModal>(null);
  const hasShownNotificationsSheet = useRef(false);

  // Track screen view
  useEffect(() => {
    track(Events.TRACKING_SCREEN_VIEWED, { tracked_accounts: trackedInstagrams.length });
  }, []);

  // Show notifications sheet if conditions are met (after 3s delay, once per mount)
  useEffect(() => {
    if (hasShownNotificationsSheet.current) return;
    if (trackedInstagrams.length < 1) return;

    const checkAndShowSheet = async () => {
      // Check notification permission status
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return;

      // Check if dismissed within the last 24 hours
      const dismissedAt = await AsyncStorage.getItem(NOTIFICATIONS_LATER_KEY);
      if (dismissedAt) {
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        if (elapsed < NOTIFICATIONS_LATER_DURATION_MS) return;
      }

      // Show the sheet
      notificationsSheetRef.current?.present();
    };

    const timer = setTimeout(() => {
      hasShownNotificationsSheet.current = true;
      checkAndShowSheet();
    }, 3000);
    return () => clearTimeout(timer);
  }, [trackedInstagrams.length]);

  const handleEnableNotifications = useCallback(async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    console.log('Notification permission status:', status);

    if (status === 'granted') {
      // Register device push token with Customer.io
      try {
        const { data: deviceToken } = await Notifications.getDevicePushTokenAsync();
        if (Platform.OS === 'ios' && deviceToken) {
          console.log('🔧 Registering iOS push token with Customer.io:', deviceToken);
          CustomerIO.registerDeviceToken(deviceToken);
        }
      } catch (error) {
        console.log('⚠️ Could not get push token:', error);
      }
      notificationsSheetRef.current?.dismiss();
    } else if (status === 'denied') {
      // Permission was denied, show alert to open settings
      Alert.alert(
        'Notifications Disabled',
        'To receive notifications, please enable them in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
        ]
      );
    }
  }, []);

  const handleMaybeLater = useCallback(async () => {
    // Store timestamp for 24h delay
    await AsyncStorage.setItem(NOTIFICATIONS_LATER_KEY, Date.now().toString());
    notificationsSheetRef.current?.dismiss();
  }, []);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <Circles width={700} height={700} />
        </View>
        <ActivityIndicator size="large" color="#6b7280" />
      </View>
    );
  }

  // Not connected state - redirect to home after connecting
  if (!isLoggedIn) {
    return (
      <NotConnected
        onConnect={() => {
          showLogin();
          router.replace('/(tabs)/home');
        }}
      />
    );
  }

  // Empty state
  if (trackedInstagrams.length === 0) {
    return <NotTracking />;
  }

  // List with accounts
  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView>
        <View className="items-center justify-center pb-2 pt-2">
          <Logo width={160} height={30} />
        </View>
      </SafeAreaView>

      <View className="flex-1 justify-between px-4 pb-4 pt-2">
        {/* Tracked accounts list */}
        <View>
          {/* New activity banner */}
          {hasNewActivity || true ? (
            <NewActivityBanner isSyncing={syncState.isActive} onRefresh={sync} />
          ) : null}
          <View className="gap-3">
            {trackedInstagrams.map((instagram) => (
              <TrackedAccountItem
                key={instagram.user_id}
                account={instagram}
                syncStatus={syncState.trackedAccounts.find(
                  (acc) => acc.userId === instagram.user_id
                )}
              />
            ))}
          </View>
        </View>

        {/* Add another account CTA - bottom aligned */}
        <View className="background-red items-center pb-4">
          <Text className="px-2 text-center font-roboto-extrablack text-4xl tracking-tighter">
            Why stop now? The more, the messier!
          </Text>
          <View className="mt-6 w-full">
            <Button
              label="Track account"
              onPress={() => {
                if (trackedInstagrams.length >= MAX_TRACKED_ACCOUNTS) {
                  Alert.alert(
                    'Limit Reached',
                    `You can track up to ${MAX_TRACKED_ACCOUNTS} accounts. Tracking more could trigger Instagram's automated activity detection, which may flag your account as a bot.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }
                router.push('/(tabs)/tracking/track');
              }}
            />
          </View>
        </View>
      </View>
      <NotificationsSheet
        ref={notificationsSheetRef}
        onEnableNotifications={handleEnableNotifications}
        onMaybeLater={handleMaybeLater}
      />
    </View>
  );
}
