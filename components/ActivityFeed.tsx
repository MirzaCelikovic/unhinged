import { View, Linking } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import AccountCard from './AccountCard';
import { useRevenueCat } from '~/contexts/RevenueCatContext';

const openInstagramProfile = (username: string) => {
  Linking.openURL(`https://instagram.com/${username}`);
};

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
  profilePicUrl: string;
  timestamp: string;
}> = [
  {
    id: 'dummy_1',
    type: 'new_follower',
    username: 'sarah_designs',
    profilePicUrl: 'https://via.assets.so/album.png?id=1&q=95&w=360&h=360&fit=fill',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy_2',
    type: 'started_following',
    username: 'mike.travels',
    profilePicUrl: 'https://via.assets.so/album.png?id=2&q=95&w=360&h=360&fit=fill',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy_3',
    type: 'lost_follower',
    username: 'emma_fitness',
    profilePicUrl: 'https://via.assets.so/album.png?id=3&q=95&w=360&h=360&fit=fill',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy_4',
    type: 'stopped_following',
    username: 'alex.photo',
    profilePicUrl: 'https://via.assets.so/album.png?id=4&q=95&w=360&h=360&fit=fill',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy_5',
    type: 'new_follower',
    username: 'travel_adventures',
    profilePicUrl: 'https://via.assets.so/album.png?id=5&q=95&w=360&h=360&fit=fill',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'dummy_6',
    type: 'started_following',
    username: 'foodie_daily',
    profilePicUrl: 'https://via.assets.so/album.png?id=6&q=95&w=360&h=360&fit=fill',
    timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
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

const formatRelativeTime = (timestamp: string, t: (key: string, opts?: any) => string): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('activityFeed.justNow');
  if (diffMins < 60) return t('activityFeed.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('activityFeed.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('activityFeed.daysAgo', { count: diffDays });
  return date.toLocaleDateString();
};

const getEventLabel = (type: FeedEvent['type'], t: (key: string) => string): string => {
  switch (type) {
    case 'new_follower':
      return t('activityFeed.startedFollowingThem');
    case 'lost_follower':
      return t('activityFeed.unfollowedThem');
    case 'started_following':
      return t('activityFeed.theyStartedFollowing');
    case 'stopped_following':
      return t('activityFeed.theyUnfollowed');
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
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const { isSubscribed, presentPaywall } = useRevenueCat();

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

  // Show 3 dummy items for non-subscribed users
  const dummyEventsForPaywall = DUMMY_EVENTS.slice(0, 3);
  const displayEvents = showDummyEvents
    ? DUMMY_EVENTS
    : !isSubscribed
      ? dummyEventsForPaywall
      : events;
  const hasTrackingStart = trackingStartDate || showDummyEvents;
  const totalItems = displayEvents.length + (hasTrackingStart ? 1 : 0);

  const handleEventPress = (username: string) => {
    if (!isSubscribed) {
      presentPaywall('activity_feed_tracked');
      return;
    }
    openInstagramProfile(username);
  };

  return (
    <View className="overflow-hidden rounded-2xl bg-white">
      {/* Events */}
      {displayEvents.map((event, index) => (
        <AccountCard
          key={event.id}
          username={event.username}
          profilePicUrl={event.profilePicUrl}
          label={getEventLabel(event.type, t)}
          timestamp={formatRelativeTime(event.timestamp, t)}
          isRow
          isLastRow={!hasTrackingStart && index === displayEvents.length - 1}
          onPress={() => handleEventPress(event.username)}
          blurred={!isSubscribed}
        />
      ))}

      {/* "You started tracking" item - always shown at bottom */}
      {hasTrackingStart && (
        <AccountCard
          username={trackedUsername || t('activityFeed.defaultUsername')}
          profilePicUrl={trackedProfilePicUrl}
          label={t('activityFeed.youStartedTracking')}
          timestamp={formatRelativeTime(
            trackingStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            t
          )}
          isRow
          isLastRow
          onPress={() => openInstagramProfile(trackedUsername || t('activityFeed.defaultUsername'))}
        />
      )}
    </View>
  );
}
