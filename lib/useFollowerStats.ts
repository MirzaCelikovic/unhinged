import * as SQLite from 'expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import { useAnalytics } from '~/contexts/AnalyticsContext';
import { getFollowBackCount, getFollowBacks } from './followBacks';

export type { FollowBack, FollowBackConnectionType } from './followBacks';
export { getFollowBacks, getFollowBackCount } from './followBacks';

// Number of days to consider as "recent" for activity
const RECENT_DAYS = 30;

// COM: "Follow backs" (mutual-follow) surfacing is flag-gated. Off by default so
// existing stats are unchanged until the Amplitude experiment turns it on.
const FOLLOW_BACKS_FLAG = 'follow_backs';

export type AccountListType =
  | 'addedFollowing'
  | 'removedFollowing'
  | 'gainedFollowers'
  | 'lostFollowers'
  | 'notFollowingBack'
  | 'notFollowedBack'
  | 'followBacks'
  | 'allFollowers'
  | 'allFollowing';

// Maps each list type to the i18n keys for its main-account / tracked-account
// label variants. Callers resolve the returned key through `t()`.
export const ACCOUNT_LIST_LABELS: Record<AccountListType, { main: string; tracked: string }> = {
  addedFollowing: {
    main: 'accountLabels.addedFollowing.main',
    tracked: 'accountLabels.addedFollowing.tracked',
  },
  removedFollowing: {
    main: 'accountLabels.removedFollowing.main',
    tracked: 'accountLabels.removedFollowing.tracked',
  },
  gainedFollowers: {
    main: 'accountLabels.gainedFollowers.main',
    tracked: 'accountLabels.gainedFollowers.tracked',
  },
  lostFollowers: {
    main: 'accountLabels.lostFollowers.main',
    tracked: 'accountLabels.lostFollowers.tracked',
  },
  notFollowedBack: {
    main: 'accountLabels.notFollowedBack.main',
    tracked: 'accountLabels.notFollowedBack.tracked',
  },
  notFollowingBack: {
    main: 'accountLabels.notFollowingBack.main',
    tracked: 'accountLabels.notFollowingBack.tracked',
  },
  followBacks: {
    main: 'accountLabels.followBacks.main',
    tracked: 'accountLabels.followBacks.tracked',
  },
  allFollowers: {
    main: 'accountLabels.allFollowers.main',
    tracked: 'accountLabels.allFollowers.tracked',
  },
  allFollowing: {
    main: 'accountLabels.allFollowing.main',
    tracked: 'accountLabels.allFollowing.tracked',
  },
};

// Returns the i18n key for the requested label; resolve it with `t()` at the call site.
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
  followBacks: number;
  lastSyncedAt: string | null;
}

const fetchFollowerStats = async (
  db: SQLite.SQLiteDatabase,
  userId: string,
  followBacksEnabled: boolean
): Promise<FollowerStats> => {
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

  // followBacks: new mutual follows (flag-gated; 0 when the experiment is off)
  const followBacks = followBacksEnabled ? await getFollowBackCount(db, userId) : 0;

  return {
    addedFollowing,
    removedFollowing,
    gainedFollowers,
    lostFollowers,
    notFollowingBack,
    notFollowedBack,
    followBacks,
    lastSyncedAt,
  };
};

export const useFollowerStats = (userId: string | null, latestActivityDate?: string | null) => {
  const db = useSQLiteContext();
  const { getVariant } = useAnalytics();
  const followBacksEnabled = getVariant(FOLLOW_BACKS_FLAG) === 'on';

  const query = useQuery<FollowerStats>({
    queryKey: ['followerStats', userId, followBacksEnabled],
    queryFn: () => fetchFollowerStats(db, userId!, followBacksEnabled),
    enabled: !!userId,
    initialData: {
      addedFollowing: 0,
      removedFollowing: 0,
      gainedFollowers: 0,
      lostFollowers: 0,
      notFollowingBack: 0,
      notFollowedBack: 0,
      followBacks: 0,
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
  db: SQLite.SQLiteDatabase,
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

    case 'followBacks': {
      // New mutual follows, enriched with profile metadata.
      const followBacks = await getFollowBacks(db, userId);
      return followBacks.map(fb => ({
        id: fb.user_id,
        username: fb.username || fb.user_id,
        full_name: fb.full_name,
        profile_pic_url: fb.profile_pic_url,
      }));
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
