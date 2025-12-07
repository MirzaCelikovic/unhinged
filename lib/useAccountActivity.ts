import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

interface AccountActivity {
  hasNewActivity: boolean;
  newFollowsCount: number;
  unfollowsCount: number;
  newFollowersCount: number;
  lostFollowersCount: number;
}

const fetchAccountActivity = async (db: any, userId: string): Promise<AccountActivity> => {
  // Get last viewed timestamp for this account
  const syncState = await db.getFirstAsync<{ last_viewed_at: string | null }>(
    'SELECT last_viewed_at FROM sync_state WHERE instagram_user_id = ?',
    [userId]
  );

  const lastViewedAt = syncState?.last_viewed_at || '1970-01-01T00:00:00.000Z';

  // Count new follows since last viewed
  const newFollowsResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followings
     WHERE tracked_account_id = ?
     AND is_baseline = 0
     AND first_seen_at > ?`,
    [userId, lastViewedAt]
  );
  const newFollowsCount = newFollowsResult[0]?.count || 0;

  // Count unfollows since last viewed
  const unfollowsResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followings
     WHERE tracked_account_id = ?
     AND ended_at IS NOT NULL
     AND ended_at > ?`,
    [userId, lastViewedAt]
  );
  const unfollowsCount = unfollowsResult[0]?.count || 0;

  // Count new followers since last viewed
  const newFollowersResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followers
     WHERE tracked_account_id = ?
     AND is_baseline = 0
     AND first_seen_at > ?`,
    [userId, lastViewedAt]
  );
  const newFollowersCount = newFollowersResult[0]?.count || 0;

  // Count lost followers since last viewed
  const lostFollowersResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followers
     WHERE tracked_account_id = ?
     AND ended_at IS NOT NULL
     AND ended_at > ?`,
    [userId, lastViewedAt]
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

export const useAccountActivity = (userId: string | null) => {
  const db = useSQLiteContext();

  return useQuery<AccountActivity>({
    queryKey: ['accountActivity', userId],
    queryFn: () => fetchAccountActivity(db, userId!),
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

// Check if any tracked account has new activity
const fetchHasAnyActivity = async (db: any, trackedUserIds: string[]): Promise<boolean> => {
  if (trackedUserIds.length === 0) return false;

  // For each tracked account, check if there's activity since last_viewed_at
  for (const userId of trackedUserIds) {
    const activity = await fetchAccountActivity(db, userId);
    if (activity.hasNewActivity) {
      return true;
    }
  }

  return false;
};

export const useHasAnyActivity = (trackedUserIds: string[]) => {
  const db = useSQLiteContext();

  return useQuery<boolean>({
    queryKey: ['hasAnyActivity', ...trackedUserIds],
    queryFn: () => fetchHasAnyActivity(db, trackedUserIds),
    enabled: trackedUserIds.length > 0,
    initialData: false,
  });
};

// Mark account activity as viewed
export const markActivityAsViewed = async (db: any, userId: string): Promise<void> => {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_state
     SET last_viewed_at = ?, date_updated = ?
     WHERE instagram_user_id = ?`,
    [now, now, userId]
  );
};
