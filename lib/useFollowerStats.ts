import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

export type AccountListType =
  | 'addedFollowing'
  | 'removedFollowing'
  | 'gainedFollowers'
  | 'lostFollowers'
  | 'notFollowingBack'
  | 'notFollowedBack';

export const ACCOUNT_LIST_LABELS: Record<AccountListType, { main: string; tracked: string }> = {
  addedFollowing: { main: 'You recently followed', tracked: 'They recently followed' },
  removedFollowing: { main: 'You recently unfollowed', tracked: 'They recently unfollowed' },
  gainedFollowers: { main: 'Recently followed you', tracked: 'Recently followed by' },
  lostFollowers: { main: 'Recently unfollowed you', tracked: 'Recently unfollowed them' },
  notFollowedBack: { main: "You aren't following back", tracked: 'They are not following back' },
  notFollowingBack: { main: 'Not following you back', tracked: 'Not following them back' },
};

export const getAccountListLabel = (type: AccountListType, isMainAccount: boolean): string => {
  return isMainAccount ? ACCOUNT_LIST_LABELS[type].main : ACCOUNT_LIST_LABELS[type].tracked;
};

export interface FollowerStats {
  addedFollowing: number;
  removedFollowing: number;
  gainedFollowers: number;
  lostFollowers: number;
  notFollowingBack: number;
  notFollowedBack: number;
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

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // addedFollowing: Accounts this account started following (not baseline) in last 30 days
  const addedFollowingResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ? AND is_baseline = 0 AND first_seen_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const addedFollowing = addedFollowingResult[0]?.count || 0;

  // removedFollowing: Accounts this account stopped following in last 30 days
  const removedFollowingResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const removedFollowing = removedFollowingResult[0]?.count || 0;

  // gainedFollowers: Accounts that started following this account after stability was established
  // We require at least 3 syncs before counting new followers to avoid false positives from API unreliability
  // A follower is "genuinely new" if they first appeared after we had at least 3 syncs
  const MIN_SYNCS_FOR_NEW_FOLLOWERS = 3;
  const syncStateResult = await db.getFirstAsync<{ total_syncs: number }>(
    'SELECT total_syncs FROM sync_state WHERE instagram_user_id = ?',
    [userId]
  );
  const accountTotalSyncs = syncStateResult?.total_syncs || 0;

  let gainedFollowers = 0;
  if (accountTotalSyncs >= MIN_SYNCS_FOR_NEW_FOLLOWERS) {
    // Count followers who first appeared after stability was established
    // Their total_syncs will be low (they just joined) while account's total_syncs is high
    // If account has done 10 syncs and follower has total_syncs=2, they appeared on sync 9
    // We want followers who appeared after sync 3, i.e., follower.total_syncs <= accountTotalSyncs - 3
    const gainedFollowersResult = await db.getAllAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM followers
       WHERE tracked_account_id = ?
       AND is_baseline = 0
       AND first_seen_at >= ?
       AND total_syncs <= ? - ?`,
      [userId, thirtyDaysAgo.toISOString(), accountTotalSyncs, MIN_SYNCS_FOR_NEW_FOLLOWERS]
    );
    gainedFollowers = gainedFollowersResult[0]?.count || 0;
  }

  // lostFollowers: Accounts that stopped following this account in last 30 days
  const lostFollowersResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, thirtyDaysAgo.toISOString()]
  );
  const lostFollowers = lostFollowersResult[0]?.count || 0;

  // notFollowingBack: Accounts this account follows that don't follow back
  const notFollowingBack = followings.filter(f => !followerIds.has(f.followed_user_id)).length;

  // notFollowedBack: Followers this account doesn't follow back
  const notFollowedBack = followers.filter(f => !followingIds.has(f.follower_user_id)).length;

  return {
    addedFollowing,
    removedFollowing,
    gainedFollowers,
    lostFollowers,
    notFollowingBack,
    notFollowedBack,
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
      addedFollowing: 0,
      removedFollowing: 0,
      gainedFollowers: 0,
      lostFollowers: 0,
      notFollowingBack: 0,
      notFollowedBack: 0,
      lastSyncedAt: null,
    },
  });
};

// Account list item
export interface AccountListItem {
  id: string;
  username: string;
  profile_pic_url: string | null;
}

const fetchAccountList = async (
  db: any,
  userId: string,
  type: AccountListType
): Promise<AccountListItem[]> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (type) {
    case 'addedFollowing': {
      // Accounts this account started following (not baseline) in last 30 days
      const results = await db.getAllAsync<{ followed_user_id: string; username: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.is_baseline = 0 AND f.first_seen_at >= ?`,
        [userId, thirtyDaysAgo.toISOString()]
      );
      return results.map(r => ({ id: r.followed_user_id, username: r.username || r.followed_user_id, profile_pic_url: r.profile_pic_url }));
    }

    case 'removedFollowing': {
      // Accounts this account stopped following in last 30 days
      const results = await db.getAllAsync<{ followed_user_id: string; username: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL AND f.ended_at >= ?`,
        [userId, thirtyDaysAgo.toISOString()]
      );
      return results.map(r => ({ id: r.followed_user_id, username: r.username || r.followed_user_id, profile_pic_url: r.profile_pic_url }));
    }

    case 'gainedFollowers': {
      // Accounts that started following this account after stability was established
      const MIN_SYNCS_FOR_NEW_FOLLOWERS = 3;
      const syncStateResult = await db.getFirstAsync<{ total_syncs: number }>(
        'SELECT total_syncs FROM sync_state WHERE instagram_user_id = ?',
        [userId]
      );
      const accountTotalSyncs = syncStateResult?.total_syncs || 0;

      if (accountTotalSyncs < MIN_SYNCS_FOR_NEW_FOLLOWERS) {
        return [];
      }

      const results = await db.getAllAsync<{ follower_user_id: string; username: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ?
         AND f.is_baseline = 0
         AND f.first_seen_at >= ?
         AND f.total_syncs <= ? - ?`,
        [userId, thirtyDaysAgo.toISOString(), accountTotalSyncs, MIN_SYNCS_FOR_NEW_FOLLOWERS]
      );
      return results.map(r => ({ id: r.follower_user_id, username: r.username || r.follower_user_id, profile_pic_url: r.profile_pic_url }));
    }

    case 'lostFollowers': {
      // Accounts that stopped following this account in last 30 days
      const results = await db.getAllAsync<{ follower_user_id: string; username: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL AND f.ended_at >= ?`,
        [userId, thirtyDaysAgo.toISOString()]
      );
      return results.map(r => ({ id: r.follower_user_id, username: r.username || r.follower_user_id, profile_pic_url: r.profile_pic_url }));
    }

    case 'notFollowingBack': {
      // Accounts this account follows that don't follow back
      const followers = await db.getAllAsync<{ follower_user_id: string }>(
        'SELECT follower_user_id FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
        [userId]
      );
      const followerIds = new Set(followers.map(f => f.follower_user_id));

      const followings = await db.getAllAsync<{ followed_user_id: string; username: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
        [userId]
      );

      return followings
        .filter(f => !followerIds.has(f.followed_user_id))
        .map(f => ({ id: f.followed_user_id, username: f.username || f.followed_user_id, profile_pic_url: f.profile_pic_url }));
    }

    case 'notFollowedBack': {
      // Followers this account doesn't follow back
      const followings = await db.getAllAsync<{ followed_user_id: string }>(
        'SELECT followed_user_id FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
        [userId]
      );
      const followingIds = new Set(followings.map(f => f.followed_user_id));

      const followers = await db.getAllAsync<{ follower_user_id: string; username: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
        [userId]
      );

      return followers
        .filter(f => !followingIds.has(f.follower_user_id))
        .map(f => ({ id: f.follower_user_id, username: f.username || f.follower_user_id, profile_pic_url: f.profile_pic_url }));
    }

    default:
      return [];
  }
};

export const useAccountList = (userId: string | null, type: AccountListType | null) => {
  const db = useSQLiteContext();

  return useQuery<AccountListItem[]>({
    queryKey: ['accountList', userId, type],
    queryFn: () => fetchAccountList(db, userId!, type!),
    enabled: !!userId && !!type,
    initialData: [],
  });
};
