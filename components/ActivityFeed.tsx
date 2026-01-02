import { View, Text, Image, ImageSourcePropType } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

interface FeedEvent {
  id: string;
  type: 'new_follower' | 'lost_follower' | 'started_following' | 'stopped_following';
  userId: string;
  username: string;
  profilePicUrl: string | null;
  timestamp: string;
}

// Dummy data for preview - set showDummyEvents to true to enable
const DUMMY_EVENTS: Array<{
  id: string;
  type: FeedEvent['type'];
  username: string;
  image: ImageSourcePropType;
  timestamp: string;
}> = [
  {
    id: 'dummy_1',
    type: 'new_follower',
    username: 'sarah_designs',
    image: require('~/assets/profile_0.jpg'),
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: 'dummy_2',
    type: 'started_following',
    username: 'mike.travels',
    image: require('~/assets/profile_1.jpg'),
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
  },
  {
    id: 'dummy_3',
    type: 'lost_follower',
    username: 'emma_fitness',
    image: require('~/assets/profile_2.jpg'),
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: 'dummy_4',
    type: 'stopped_following',
    username: 'alex.photo',
    image: require('~/assets/profile_0.jpg'),
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
  {
    id: 'dummy_5',
    type: 'new_follower',
    username: 'travel_adventures',
    image: require('~/assets/profile_1.jpg'),
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
  },
  {
    id: 'dummy_6',
    type: 'started_following',
    username: 'foodie_daily',
    image: require('~/assets/profile_2.jpg'),
    timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days ago
  },
];

const fetchActivityFeed = async (db: any, trackedAccountId: string): Promise<FeedEvent[]> => {
  const events: FeedEvent[] = [];

  // Get new followers (non-baseline, recent)
  const newFollowers = await db.getAllAsync<{
    follower_user_id: string;
    username: string;
    profile_pic_url: string | null;
    first_seen_at: string;
  }>(
    `SELECT f.follower_user_id, i.username, i.profile_pic_url, f.first_seen_at
     FROM followers f
     LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
     WHERE f.tracked_account_id = ? AND f.is_baseline = 0
     ORDER BY f.first_seen_at DESC
     LIMIT 20`,
    [trackedAccountId]
  );

  for (const f of newFollowers) {
    events.push({
      id: `new_follower_${f.follower_user_id}`,
      type: 'new_follower',
      userId: f.follower_user_id,
      username: f.username || f.follower_user_id,
      profilePicUrl: f.profile_pic_url,
      timestamp: f.first_seen_at,
    });
  }

  // Get lost followers (ended_at set)
  const lostFollowers = await db.getAllAsync<{
    follower_user_id: string;
    username: string;
    profile_pic_url: string | null;
    ended_at: string;
  }>(
    `SELECT f.follower_user_id, i.username, i.profile_pic_url, f.ended_at
     FROM followers f
     LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
     WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL
     ORDER BY f.ended_at DESC
     LIMIT 20`,
    [trackedAccountId]
  );

  for (const f of lostFollowers) {
    events.push({
      id: `lost_follower_${f.follower_user_id}`,
      type: 'lost_follower',
      userId: f.follower_user_id,
      username: f.username || f.follower_user_id,
      profilePicUrl: f.profile_pic_url,
      timestamp: f.ended_at,
    });
  }

  // Get new following (non-baseline)
  const newFollowing = await db.getAllAsync<{
    followed_user_id: string;
    username: string;
    profile_pic_url: string | null;
    first_seen_at: string;
  }>(
    `SELECT f.followed_user_id, i.username, i.profile_pic_url, f.first_seen_at
     FROM followings f
     LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
     WHERE f.tracked_account_id = ? AND f.is_baseline = 0
     ORDER BY f.first_seen_at DESC
     LIMIT 20`,
    [trackedAccountId]
  );

  for (const f of newFollowing) {
    events.push({
      id: `started_following_${f.followed_user_id}`,
      type: 'started_following',
      userId: f.followed_user_id,
      username: f.username || f.followed_user_id,
      profilePicUrl: f.profile_pic_url,
      timestamp: f.first_seen_at,
    });
  }

  // Get stopped following (ended_at set)
  const stoppedFollowing = await db.getAllAsync<{
    followed_user_id: string;
    username: string;
    profile_pic_url: string | null;
    ended_at: string;
  }>(
    `SELECT f.followed_user_id, i.username, i.profile_pic_url, f.ended_at
     FROM followings f
     LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
     WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL
     ORDER BY f.ended_at DESC
     LIMIT 20`,
    [trackedAccountId]
  );

  for (const f of stoppedFollowing) {
    events.push({
      id: `stopped_following_${f.followed_user_id}`,
      type: 'stopped_following',
      userId: f.followed_user_id,
      username: f.username || f.followed_user_id,
      profilePicUrl: f.profile_pic_url,
      timestamp: f.ended_at,
    });
  }

  // Sort all events by timestamp descending
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Return top 10
  return events.slice(0, 10);
};

const formatRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const getEventLabel = (type: FeedEvent['type']): string => {
  switch (type) {
    case 'new_follower':
      return 'started following them';
    case 'lost_follower':
      return 'unfollowed them';
    case 'started_following':
      return 'they started following';
    case 'stopped_following':
      return 'they unfollowed';
  }
};

interface ActivityFeedProps {
  userId: string;
  trackedUsername?: string;
  trackedProfilePicUrl?: string | null;
}

export default function ActivityFeed({
  userId,
  trackedUsername,
  trackedProfilePicUrl,
}: ActivityFeedProps) {
  const db = useSQLiteContext();

  const { data: events = [] } = useQuery({
    queryKey: ['activityFeed', userId],
    queryFn: () => fetchActivityFeed(db, userId),
    enabled: !!userId,
  });

  // Get tracking start date from sync_state
  const { data: trackingStartDate } = useQuery({
    queryKey: ['trackingStart', userId],
    queryFn: async () => {
      const result = await db.getFirstAsync<{ date_created: string }>(
        'SELECT date_created FROM sync_state WHERE instagram_user_id = ?',
        [userId]
      );
      return result?.date_created || null;
    },
    enabled: !!userId,
  });

  // Show dummy events for preview - set to true to enable
  const showDummyEvents = false;

  return (
    <View className="rounded-3xl bg-white">
      {/* Dummy events for preview */}
      {showDummyEvents &&
        DUMMY_EVENTS.map((event) => (
          <View key={event.id}>
            <View className="flex-row items-center gap-3 p-4">
              <Image source={event.image} className="h-10 w-10 rounded-full" />
              <View className="flex-1">
                <Text className="font-roboto-medium text-base text-gray-900">
                  @{event.username}
                </Text>
                <Text className="font-roboto-regular text-sm text-gray-500">
                  {getEventLabel(event.type)}
                </Text>
              </View>
              <Text className="font-roboto-regular text-sm text-gray-400">
                {formatRelativeTime(event.timestamp)}
              </Text>
            </View>
            <View className="mx-4 h-[1px] bg-gray-100" />
          </View>
        ))}

      {/* Real events */}
      {!showDummyEvents &&
        events.map((event) => (
          <View key={event.id}>
            <View className="flex-row items-center gap-3 p-4">
              {event.profilePicUrl ? (
                <Image source={{ uri: event.profilePicUrl }} className="h-10 w-10 rounded-full" />
              ) : (
                <View className="h-10 w-10 rounded-full bg-gray-200" />
              )}
              <View className="flex-1">
                <Text className="font-roboto-medium text-base text-gray-900">
                  @{event.username}
                </Text>
                <Text className="font-roboto-regular text-sm text-gray-500">
                  {getEventLabel(event.type)}
                </Text>
              </View>
              <Text className="font-roboto-regular text-sm text-gray-400">
                {formatRelativeTime(event.timestamp)}
              </Text>
            </View>
            <View className="mx-4 h-[1px] bg-gray-100" />
          </View>
        ))}

      {/* "You started tracking" item - always shown at bottom */}
      {(trackingStartDate || showDummyEvents) && (
        <View className="flex-row items-center gap-3 p-4">
          {trackedProfilePicUrl ? (
            <Image source={{ uri: trackedProfilePicUrl }} className="h-10 w-10 rounded-full" />
          ) : (
            <View className="h-10 w-10 rounded-full bg-gray-200" />
          )}
          <View className="flex-1">
            <Text className="font-roboto-medium text-base text-gray-900">
              @{trackedUsername || 'username'}
            </Text>
            <Text className="font-roboto-regular text-sm text-gray-500">you started tracking</Text>
          </View>
          <Text className="font-roboto-regular text-sm text-gray-400">
            {formatRelativeTime(
              trackingStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            )}
          </Text>
        </View>
      )}
    </View>
  );
}
