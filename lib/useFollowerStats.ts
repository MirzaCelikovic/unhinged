import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';

// Number of days to consider as "recent" for activity
const RECENT_DAYS = 30;

export type AccountListType =
  | 'addedFollowing'
  | 'removedFollowing'
  | 'gainedFollowers'
  | 'lostFollowers'
  | 'notFollowingBack'
  | 'notFollowedBack'
  | 'allFollowers'
  | 'allFollowing';

// i18n keys (resolved via t() at each call site, namespace 'home'); the English
// copy lives in lib/i18n/locales/en/home.json under `accountList.*`.
export const ACCOUNT_LIST_LABELS: Record<AccountListType, { main: string; tracked: string }> = {
  addedFollowing: { main: 'accountList.addedFollowing.main', tracked: 'accountList.addedFollowing.tracked' },
  removedFollowing: { main: 'accountList.removedFollowing.main', tracked: 'accountList.removedFollowing.tracked' },
  gainedFollowers: { main: 'accountList.gainedFollowers.main', tracked: 'accountList.gainedFollowers.tracked' },
  lostFollowers: { main: 'accountList.lostFollowers.main', tracked: 'accountList.lostFollowers.tracked' },
  notFollowedBack: { main: 'accountList.notFollowedBack.main', tracked: 'accountList.notFollowedBack.tracked' },
  notFollowingBack: { main: 'accountList.notFollowingBack.main', tracked: 'accountList.notFollowingBack.tracked' },
  allFollowers: { main: 'accountList.allFollowers.main', tracked: 'accountList.allFollowers.tracked' },
  allFollowing: { main: 'accountList.allFollowing.main', tracked: 'accountList.allFollowing.tracked' },
};

// Returns the i18n key for the label; resolve with `t(key)` (namespace 'home').
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

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - RECENT_DAYS);

  // addedFollowing: Accounts this account started following (not baseline) recently
  const addedFollowingResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ? AND is_baseline = 0 AND first_seen_at >= ?',
    [userId, recentCutoff.toISOString()]
  );
  const addedFollowing = addedFollowingResult[0]?.count || 0;

  // removedFollowing: Accounts this account stopped following recently
  const removedFollowingResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, recentCutoff.toISOString()]
  );
  const removedFollowing = removedFollowingResult[0]?.count || 0;

  // gainedFollowers: Accounts that started following this account (not baseline) recently
  const gainedFollowersResult = await db.getAllAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM followers
     WHERE tracked_account_id = ?
     AND is_baseline = 0
     AND first_seen_at >= ?`,
    [userId, recentCutoff.toISOString()]
  );
  const gainedFollowers = gainedFollowersResult[0]?.count || 0;

  // lostFollowers: Accounts that stopped following this account recently
  const lostFollowersResult = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ? AND ended_at IS NOT NULL AND ended_at >= ?',
    [userId, recentCutoff.toISOString()]
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

export const useFollowerStats = (userId: string | null, latestActivityDate?: string | null) => {
  const db = useSQLiteContext();

  const query = useQuery<FollowerStats>({
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

  // Check if there's new activity since last sync (both dates are UTC)
  const hasNewActivity =
    !!latestActivityDate &&
    !!query.data?.lastSyncedAt &&
    new Date(latestActivityDate) > new Date(query.data.lastSyncedAt);

  return {
    ...query,
    hasNewActivity,
  };
};

// Account list item
export interface AccountListItem {
  id: string;
  username: string;
  full_name: string | null;
  profile_pic_url: string | null;
}

const fetchAccountList = async (
  db: any,
  userId: string,
  type: AccountListType
): Promise<AccountListItem[]> => {
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - RECENT_DAYS);

  switch (type) {
    case 'addedFollowing': {
      // Accounts this account started following (not baseline) recently
      const results = await db.getAllAsync<{ followed_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.is_baseline = 0 AND f.first_seen_at >= ?`,
        [userId, recentCutoff.toISOString()]
      );
      return results.map(r => ({ id: r.followed_user_id, username: r.username || r.followed_user_id, full_name: r.full_name, profile_pic_url: r.profile_pic_url }));
    }

    case 'removedFollowing': {
      // Accounts this account stopped following recently
      const results = await db.getAllAsync<{ followed_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL AND f.ended_at >= ?`,
        [userId, recentCutoff.toISOString()]
      );
      return results.map(r => ({ id: r.followed_user_id, username: r.username || r.followed_user_id, full_name: r.full_name, profile_pic_url: r.profile_pic_url }));
    }

    case 'gainedFollowers': {
      // Accounts that started following this account (not baseline) recently
      const results = await db.getAllAsync<{ follower_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ?
         AND f.is_baseline = 0
         AND f.first_seen_at >= ?`,
        [userId, recentCutoff.toISOString()]
      );
      return results.map(r => ({ id: r.follower_user_id, username: r.username || r.follower_user_id, full_name: r.full_name, profile_pic_url: r.profile_pic_url }));
    }

    case 'lostFollowers': {
      // Accounts that stopped following this account recently
      const results = await db.getAllAsync<{ follower_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NOT NULL AND f.ended_at >= ?`,
        [userId, recentCutoff.toISOString()]
      );
      return results.map(r => ({ id: r.follower_user_id, username: r.username || r.follower_user_id, full_name: r.full_name, profile_pic_url: r.profile_pic_url }));
    }

    case 'notFollowingBack': {
      // Accounts this account follows that don't follow back
      const followers = await db.getAllAsync<{ follower_user_id: string }>(
        'SELECT follower_user_id FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
        [userId]
      );
      const followerIds = new Set(followers.map(f => f.follower_user_id));

      const followings = await db.getAllAsync<{ followed_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
        [userId]
      );

      return followings
        .filter(f => !followerIds.has(f.followed_user_id))
        .map(f => ({ id: f.followed_user_id, username: f.username || f.followed_user_id, full_name: f.full_name, profile_pic_url: f.profile_pic_url }));
    }

    case 'notFollowedBack': {
      // Followers this account doesn't follow back
      const followings = await db.getAllAsync<{ followed_user_id: string }>(
        'SELECT followed_user_id FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
        [userId]
      );
      const followingIds = new Set(followings.map(f => f.followed_user_id));

      const followers = await db.getAllAsync<{ follower_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
        [userId]
      );

      return followers
        .filter(f => !followingIds.has(f.follower_user_id))
        .map(f => ({ id: f.follower_user_id, username: f.username || f.follower_user_id, full_name: f.full_name, profile_pic_url: f.profile_pic_url }));
    }

    case 'allFollowers': {
      // All active followers
      const results = await db.getAllAsync<{ follower_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.follower_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followers f
         LEFT JOIN instagrams i ON f.follower_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
        [userId]
      );
      return results.map(r => ({ id: r.follower_user_id, username: r.username || r.follower_user_id, full_name: r.full_name, profile_pic_url: r.profile_pic_url }));
    }

    case 'allFollowing': {
      // All active followings
      const results = await db.getAllAsync<{ followed_user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }>(
        `SELECT f.followed_user_id, i.username, i.full_name, i.profile_pic_url
         FROM followings f
         LEFT JOIN instagrams i ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ? AND f.ended_at IS NULL`,
        [userId]
      );
      return results.map(r => ({ id: r.followed_user_id, username: r.username || r.followed_user_id, full_name: r.full_name, profile_pic_url: r.profile_pic_url }));
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
