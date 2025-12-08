import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

export interface FollowerStats {
  notFollowingBack: number;
  notFollowingYouBack: number;
  recentlyUnfollowed: number;
  recentlyFollowed: number;
  recentlyFollowedThem: number;
  recentlyUnfollowedThem: number;
  lastSyncedAt: string | null;
}

const fetchFollowerStats = async (db: any, userId: string): Promise<FollowerStats> => {
  // Get last sync time
  const syncState = await db.getFirstAsync<{ last_synced_at: string }>(
    'SELECT last_synced_at FROM sync_state WHERE instagram_user_id = ? ORDER BY last_synced_at DESC LIMIT 1',
    [userId]
  );
  const lastSyncedAt = syncState?.last_synced_at || null;

  // Get all active followers (people following the account)
  const followers = await db.getAllAsync<{ follower_user_id: string }>(
    'SELECT follower_user_id FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
    [userId]
  );
  const followerIds = new Set(followers.map(f => f.follower_user_id));

  // Get all active followings (people the account follows)
  const followings = await db.getAllAsync<{ followed_user_id: string }>(
    'SELECT followed_user_id FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
    [userId]
  );
  const followingIds = new Set(followings.map(f => f.followed_user_id));

  // They aren't following back: Followers that are NOT in followings
  const notFollowingBack = followers.filter(f => !followingIds.has(f.follower_user_id)).length;

  // Not following them back: Followings that are NOT in followers
  const notFollowingYouBack = followings.filter(f => !followerIds.has(f.followed_user_id)).length;

  // Recently followed: New people the account started following (not baseline) in last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentlyFollowedResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ? AND is_baseline = 0 AND first_seen_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const recentlyFollowed = recentlyFollowedResult[0]?.count || 0;

  // Recently unfollowed: People the account stopped following in last 30 days
  const recentlyUnfollowedResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const recentlyUnfollowed = recentlyUnfollowedResult[0]?.count || 0;

  // Followed them: New followers (people who started following the account, not baseline) in last 30 days
  const recentlyFollowedThemResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ? AND is_baseline = 0 AND first_seen_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const recentlyFollowedThem = recentlyFollowedThemResult[0]?.count || 0;

  // Unfollowed them: People who stopped following the account in last 30 days
  const recentlyUnfollowedThemResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const recentlyUnfollowedThem = recentlyUnfollowedThemResult[0]?.count || 0;

  return {
    notFollowingBack,
    notFollowingYouBack,
    recentlyUnfollowed,
    recentlyFollowed,
    recentlyFollowedThem,
    recentlyUnfollowedThem,
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
      recentlyFollowedThem: 0,
      recentlyUnfollowedThem: 0,
      lastSyncedAt: null,
    },
  });
};
