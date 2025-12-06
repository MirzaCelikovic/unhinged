import { View, Text, ScrollView, Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useInstagram } from '~/contexts/InstagramContext';

interface Account {
  id: string;
  username: string;
  profile_pic_url: string | null;
}

type AccountType = 'notFollowingBack' | 'notFollowingYouBack' | 'recentlyUnfollowed' | 'recentlyFollowed';

const TITLES: Record<AccountType, string> = {
  notFollowingBack: 'Not Following You Back',
  notFollowingYouBack: "You're Not Following Back",
  recentlyUnfollowed: 'Recently Unfollowed You',
  recentlyFollowed: 'Recently Followed You',
};

export default function AccountsScreen() {
  const { type } = useLocalSearchParams<{ type: AccountType }>();
  const { userId } = useInstagram();
  const db = useSQLiteContext();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId || !type) return;

    const loadAccounts = async () => {
      setIsLoading(true);
      try {
        let data: Account[] = [];

        switch (type) {
          case 'notFollowingBack': {
            // People you follow but who don't follow you back
            const followers = await db.getAllAsync<{ follower_user_id: string }>(
              'SELECT follower_user_id FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
              [userId]
            );
            const followerIds = new Set(followers.map(f => f.follower_user_id));

            const followings = await db.getAllAsync<{ followed_user_id: string; username: string; profile_pic_url: string | null }>(
              `SELECT f.followed_user_id, i.username, i.profile_pic_url
               FROM followings f
               JOIN instagrams i ON f.followed_user_id = i.user_id
               WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
              [userId]
            );

            data = followings
              .filter(f => !followerIds.has(f.followed_user_id))
              .map(f => ({
                id: f.followed_user_id,
                username: f.username,
                profile_pic_url: f.profile_pic_url,
              }));
            break;
          }

          case 'notFollowingYouBack': {
            // People who follow you but you don't follow back
            const followings = await db.getAllAsync<{ followed_user_id: string }>(
              'SELECT followed_user_id FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
              [userId]
            );
            const followingIds = new Set(followings.map(f => f.followed_user_id));

            const followers = await db.getAllAsync<{ follower_user_id: string; username: string; profile_pic_url: string | null }>(
              `SELECT f.follower_user_id, i.username, i.profile_pic_url
               FROM followers f
               JOIN instagrams i ON f.follower_user_id = i.user_id
               WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
              [userId]
            );

            data = followers
              .filter(f => !followingIds.has(f.follower_user_id))
              .map(f => ({
                id: f.follower_user_id,
                username: f.username,
                profile_pic_url: f.profile_pic_url,
              }));
            break;
          }

          case 'recentlyUnfollowed': {
            // People who stopped following you in last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const unfollowers = await db.getAllAsync<{ follower_user_id: string; username: string; profile_pic_url: string | null }>(
              `SELECT f.follower_user_id, i.username, i.profile_pic_url
               FROM followers f
               JOIN instagrams i ON f.follower_user_id = i.user_id
               WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL AND f.ended_at >= ?`,
              [userId, thirtyDaysAgo.toISOString()]
            );

            data = unfollowers.map(f => ({
              id: f.follower_user_id,
              username: f.username,
              profile_pic_url: f.profile_pic_url,
            }));
            break;
          }

          case 'recentlyFollowed': {
            // New followers in last 30 days (not baseline)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const newFollowers = await db.getAllAsync<{ follower_user_id: string; username: string; profile_pic_url: string | null }>(
              `SELECT f.follower_user_id, i.username, i.profile_pic_url
               FROM followers f
               JOIN instagrams i ON f.follower_user_id = i.user_id
               WHERE f.tracked_account_id = ? AND f.is_baseline = 0 AND f.first_seen_at >= ?`,
              [userId, thirtyDaysAgo.toISOString()]
            );

            data = newFollowers.map(f => ({
              id: f.follower_user_id,
              username: f.username,
              profile_pic_url: f.profile_pic_url,
            }));
            break;
          }
        }

        setAccounts(data);
      } catch (error) {
        console.error('Error loading accounts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, [userId, type, db]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-gray-500">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="p-4">
        {accounts.length === 0 ? (
          <Text className="text-gray-500 text-center mt-8">No accounts found</Text>
        ) : (
          <View className="gap-3">
            {accounts.map((account) => (
              <View
                key={account.id}
                className="flex-row items-center gap-3 bg-gray-100 rounded-2xl p-4"
              >
                {account.profile_pic_url ? (
                  <Image
                    source={{ uri: account.profile_pic_url }}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <View className="w-12 h-12 rounded-full bg-gray-300" />
                )}
                <Text className="text-base font-medium flex-1">{account.username}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
