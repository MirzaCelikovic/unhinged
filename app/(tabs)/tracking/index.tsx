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
import { useState, useEffect } from 'react';
import { useAccountContext } from '~/contexts/AccountContext';
import { useTracks } from '~/lib/useTracks';
import { useSQLiteContext } from 'expo-sqlite';
import { CircleChevronRight } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import NotTracking from '~/components/NotTracking';
import Button from '~/components/Button';
import { Instagram } from '~/lib/types';
import { useAccountActivity } from '~/lib/useAccountActivity';

interface TrackedAccountItemProps {
  userId: string;
  username: string;
  accountData?: Instagram;
}

function TrackedAccountItem({ userId, username, accountData }: TrackedAccountItemProps) {
  const { data: activity } = useAccountActivity(userId);

  return (
    <Pressable
      className="flex-row items-center justify-between rounded-3xl bg-gray-100 p-4 active:opacity-50"
      onPress={() =>
        router.push({
          pathname: '/(tabs)/tracking/account',
          params: { userId, username },
        })
      }>
      <View className="flex-row items-center gap-3">
        {accountData?.profile_pic_url ? (
          <Image
            source={{ uri: accountData.profile_pic_url }}
            className="h-[60px] w-[60px] rounded-full"
          />
        ) : (
          <View className="h-[60px] w-[60px] rounded-full bg-gray-300" />
        )}
        <Text className="font-roboto-bold text-xl text-gray-900">@{username}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        {activity.hasNewActivity && <View className="bg-error h-3 w-3 rounded-full" />}
        <CircleChevronRight size={24} color="black" />
      </View>
    </Pressable>
  );
}

export default function Tracking() {
  const { account } = useAccountContext();
  const { data: tracks = [], isLoading } = useTracks(account?.uuid || null);
  const db = useSQLiteContext();
  const [trackedAccountsData, setTrackedAccountsData] = useState<Map<string, Instagram>>(new Map());

  // Fetch Instagram data for all tracked accounts
  useEffect(() => {
    if (tracks.length === 0) return;

    const fetchTrackedData = async () => {
      const dataMap = new Map<string, Instagram>();

      for (const track of tracks) {
        try {
          const account = await db.getFirstAsync<Instagram>(
            'SELECT user_id, username, profile_pic_url, biography, media_count FROM instagrams WHERE user_id = ?',
            [track.user_id]
          );
          if (account) {
            dataMap.set(track.user_id, account);
          }
        } catch (error) {
          console.error('Error fetching tracked account data:', error);
        }
      }

      setTrackedAccountsData(dataMap);
    };

    fetchTrackedData();
  }, [tracks]);

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

  // Empty state
  if (tracks.length === 0) {
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
            {tracks.map((item) => (
              <TrackedAccountItem
                key={item.user_id}
                userId={item.user_id}
                username={item.username}
                accountData={trackedAccountsData.get(item.user_id)}
              />
            ))}
          </View>
        </View>

        {/* Add another account CTA - bottom aligned */}
        <View className="background-red items-center pb-24">
          <Text className="font-roboto-extrablack px-2 text-center text-4xl tracking-tighter">
            Why stop now? The more the messier.
          </Text>
          <View className="mt-6 w-full">
            <Button label="Track account" mode="add" onPress={() => router.push('/track')} />
          </View>
        </View>
      </View>
    </View>
  );
}
