import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram as useInstagramContext } from '~/contexts/InstagramContext';
import { CircleChevronRight } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import NotConnected from '~/components/NotConnected';
import NotTracking from '~/components/NotTracking';
import Button from '~/components/Button';
import { Instagram } from '~/lib/types';
import { useInstagramActivity } from '~/lib/useInstagramActivity';

interface TrackedAccountItemProps {
  account: Instagram;
}

function TrackedAccountItem({ account }: TrackedAccountItemProps) {
  const { data: activity } = useInstagramActivity(account.user_id);

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
        <Text className="font-roboto-bold text-xl text-gray-900">@{account.username}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        {activity.hasNewActivity && <View className="bg-error h-3 w-3 rounded-full" />}
        <CircleChevronRight size={24} color="black" />
      </View>
    </Pressable>
  );
}

export default function Tracking() {
  const { trackedInstagrams, isLoading } = useAccountContext();
  const { isLoggedIn, showLogin } = useInstagramContext();

  if (isLoading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
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
    <View className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <View className="flex-1 justify-between p-4 pt-32">
        {/* Tracked accounts list */}
        <View>
          <View className="gap-3">
            {trackedInstagrams.map((instagram) => (
              <TrackedAccountItem key={instagram.user_id} account={instagram} />
            ))}
          </View>
        </View>

        {/* Add another account CTA - bottom aligned */}
        <View className="background-red items-center pb-24">
          <Text className="font-roboto-extrablack px-2 text-center text-4xl tracking-tighter">
            Why stop now? The more, the messier!
          </Text>
          <View className="mt-6 w-full">
            <Button label="Track account" onPress={() => router.push('/track')} />
          </View>
        </View>
      </View>
    </View>
  );
}
