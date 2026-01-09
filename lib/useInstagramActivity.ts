import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

interface InstagramActivity {
  hasNewActivity: boolean;
  newFollowsCount: number;
  unfollowsCount: number;
  newFollowersCount: number;
  lostFollowersCount: number;
}

interface SyncStateViewedAt {
  last_viewed_at: string | null;
  last_viewed_gained_followers_at: string | null;
  last_viewed_lost_followers_at: string | null;
  last_viewed_added_following_at: string | null;
  last_viewed_removed_following_at: string | null;
}

const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';

const fetchInstagramActivity = async (db: any, userId: string): Promise<InstagramActivity> => {
  // Get last viewed timestamps for this account
  const syncState = await db.getFirstAsync<SyncStateViewedAt>(
    `SELECT last_viewed_at, last_viewed_gained_followers_at, last_viewed_lost_followers_at,
            last_viewed_added_following_at, last_viewed_removed_following_at
     FROM sync_state WHERE instagram_user_id = ?`,
    [userId]
  );

  const lastViewedGainedFollowers = syncState?.last_viewed_gained_followers_at || syncState?.last_viewed_at || DEFAULT_TIMESTAMP;
  const lastViewedLostFollowers = syncState?.last_viewed_lost_followers_at || syncState?.last_viewed_at || DEFAULT_TIMESTAMP;
  const lastViewedAddedFollowing = syncState?.last_viewed_added_following_at || syncState?.last_viewed_at || DEFAULT_TIMESTAMP;
  const lastViewedRemovedFollowing = syncState?.last_viewed_removed_following_at || syncState?.last_viewed_at || DEFAULT_TIMESTAMP;

  // Count new follows since last viewed
  const newFollowsResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followings
     WHERE tracked_account_id = ?
     AND is_baseline = 0
     AND first_seen_at > ?`,
    [userId, lastViewedAddedFollowing]
  );
  const newFollowsCount = newFollowsResult[0]?.count || 0;

  // Count unfollows since last viewed
  const unfollowsResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followings
     WHERE tracked_account_id = ?
     AND ended_at IS NOT NULL
     AND ended_at > ?`,
    [userId, lastViewedRemovedFollowing]
  );
  const unfollowsCount = unfollowsResult[0]?.count || 0;

  // Count new followers since last viewed
  const newFollowersResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followers
     WHERE tracked_account_id = ?
     AND is_baseline = 0
     AND first_seen_at > ?`,
    [userId, lastViewedGainedFollowers]
  );
  const newFollowersCount = newFollowersResult[0]?.count || 0;

  // Count lost followers since last viewed
  const lostFollowersResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followers
     WHERE tracked_account_id = ?
     AND ended_at IS NOT NULL
     AND ended_at > ?`,
    [userId, lastViewedLostFollowers]
  );
  const lostFollowersCount = lostFollowersResult[0]?.count || 0;

  const hasNewActivity = newFollowsCount > 0 || unfollowsCount > 0 || newFollowersCount > 0 || lostFollowersCount > 0;

  return {
    hasNewActivity,
    newFollowsCount,
    unfollowsCount,
    newFollowersCount,
    lostFollowersCount,
  };
};

export const useInstagramActivity = (userId: string | null) => {
  const db = useSQLiteContext();

  return useQuery<InstagramActivity>({
    queryKey: ['instagramActivity', userId],
    queryFn: () => fetchInstagramActivity(db, userId!),
    enabled: !!userId,
    initialData: {
      hasNewActivity: false,
      newFollowsCount: 0,
      unfollowsCount: 0,
      newFollowersCount: 0,
      lostFollowersCount: 0,
    },
  });
};

// Check if any tracked Instagram has new activity
const fetchHasAnyInstagramActivity = async (db: any, trackedUserIds: string[]): Promise<boolean> => {
  if (trackedUserIds.length === 0) return false;

  // For each tracked account, check if there's activity since last_viewed_at
  for (const userId of trackedUserIds) {
    const activity = await fetchInstagramActivity(db, userId);
    if (activity.hasNewActivity) {
      return true;
    }
  }

  return false;
};

export const useHasAnyInstagramActivity = (trackedUserIds: string[]) => {
  const db = useSQLiteContext();

  return useQuery<boolean>({
    queryKey: ['hasAnyInstagramActivity', ...trackedUserIds],
    queryFn: () => fetchHasAnyInstagramActivity(db, trackedUserIds),
    enabled: trackedUserIds.length > 0,
    initialData: false,
  });
};

// Activity category types that can be marked as viewed
export type ActivityCategory = 'gainedFollowers' | 'lostFollowers' | 'addedFollowing' | 'removedFollowing';

const CATEGORY_TO_COLUMN: Record<ActivityCategory, string> = {
  gainedFollowers: 'last_viewed_gained_followers_at',
  lostFollowers: 'last_viewed_lost_followers_at',
  addedFollowing: 'last_viewed_added_following_at',
  removedFollowing: 'last_viewed_removed_following_at',
};

// Mark a specific activity category as viewed
export const markActivityCategoryAsViewed = async (
  db: any,
  userId: string,
  category: ActivityCategory
): Promise<void> => {
  const now = new Date().toISOString();
  const column = CATEGORY_TO_COLUMN[category];
  await db.runAsync(
    `UPDATE sync_state
     SET ${column} = ?, date_updated = ?
     WHERE instagram_user_id = ?`,
    [now, now, userId]
  );
};

// Mark all Instagram activity as viewed (legacy - updates all categories)
export const markInstagramActivityAsViewed = async (db: any, userId: string): Promise<void> => {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_state
     SET last_viewed_at = ?,
         last_viewed_gained_followers_at = ?,
         last_viewed_lost_followers_at = ?,
         last_viewed_added_following_at = ?,
         last_viewed_removed_following_at = ?,
         date_updated = ?
     WHERE instagram_user_id = ?`,
    [now, now, now, now, now, now, userId]
  );
};
