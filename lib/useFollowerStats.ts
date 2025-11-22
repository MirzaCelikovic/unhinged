import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

export interface FollowerStats {
  notFollowingBack: number;
  notFollowingYouBack: number;
  recentlyUnfollowed: number;
  recentlyFollowed: number;
  lastSyncedAt: string | null;
}

const fetchFollowerStats = async (db: any, userId: string): Promise<FollowerStats> => {
  // Get last sync time
  const syncState = await db.getFirstAsync<{ last_synced_at: string }>(
    'SELECT last_synced_at FROM sync_state WHERE instagram_user_id = ? ORDER BY last_synced_at DESC LIMIT 1',
    [userId]
  );
  const lastSyncedAt = syncState?.last_synced_at || null;

  // Get all active followers (people following me)
  const followers = await db.getAllAsync<{ follower_user_id: string }>(
    'SELECT follower_user_id FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
    [userId]
  );
  const followerIds = new Set(followers.map(f => f.follower_user_id));

  // Get all active followings (people I follow)
  const followings = await db.getAllAsync<{ followed_user_id: string }>(
    'SELECT followed_user_id FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
    [userId]
  );
  const followingIds = new Set(followings.map(f => f.followed_user_id));

  // Not following you back: People I follow but who don't follow me
  const notFollowingBack = followings.filter(f => !followerIds.has(f.followed_user_id)).length;

  // You're not following back: People who follow me but I don't follow them
  const notFollowingYouBack = followers.filter(f => !followingIds.has(f.follower_user_id)).length;

  // Recently unfollowed you: People who stopped following me (has ended_at) in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentlyUnfollowedResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const recentlyUnfollowed = recentlyUnfollowedResult[0]?.count || 0;

  // Recently followed you: New followers (not baseline) in last 30 days
  const recentlyFollowedResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ? AND is_baseline = 0 AND first_seen_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const recentlyFollowed = recentlyFollowedResult[0]?.count || 0;

  return {
    notFollowingBack,
    notFollowingYouBack,
    recentlyUnfollowed,
    recentlyFollowed,
    lastSyncedAt,
  };
};

export const useFollowerStats = (userId: string | null) => {
  const db = useSQLiteContext();

  return useQuery<FollowerStats>({
    queryKey: ['followerStats', userId],
    queryFn: () => fetchFollowerStats(db, userId!),
    enabled: !!userId,
    initialData: {
      notFollowingBack: 0,
      notFollowingYouBack: 0,
      recentlyUnfollowed: 0,
      recentlyFollowed: 0,
      lastSyncedAt: null,
    },
  });
};
