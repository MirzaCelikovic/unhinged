import * as SQLite from 'expo-sqlite';
import { getCurrentUTCTimestamp } from './database';

interface User {
  id: string;
  username: string;
  profile_pic_url?: string | null;
}

export interface ActivityItem {
  date: string; // ISO date string (YYYY-MM-DD)
  newFollows: string[]; // usernames
  unfollows: string[]; // usernames
  isTrackingStart?: boolean;
}

/**
 * Sync following list for an Instagram account
 * Handles baseline detection, change tracking, and storing in SQLite
 */
export const syncFollowingList = async (
  db: SQLite.SQLiteDatabase,
  trackedAccountId: string,
  currentUsers: User[]
): Promise<void> => {
  const now = getCurrentUTCTimestamp();

  // Check if baseline has been completed
  const syncState = await db.getFirstAsync<{ has_completed_baseline: number }>(
    'SELECT has_completed_baseline FROM sync_state WHERE instagram_user_id = ?',
    [trackedAccountId]
  );

  const isBaseline = !syncState || syncState.has_completed_baseline === 0;

  // Get existing followings that are still active
  const existing = await db.getAllAsync<{ followed_user_id: string; followed_username: string; profile_pic_url: string | null }>(
    'SELECT followed_user_id, followed_username, profile_pic_url FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
    [trackedAccountId]
  );

  const existingMap = new Map(existing.map((e) => [e.followed_user_id, { username: e.followed_username, profile_pic_url: e.profile_pic_url }]));
  const currentMap = new Map(currentUsers.map((u) => [u.id, { username: u.username, profile_pic_url: u.profile_pic_url }]));

  // Find new follows
  const newFollows = currentUsers.filter((u) => !existingMap.has(u.id));

  // Find unfollows (existed before but not in current list)
  const unfollows = existing.filter((e) => !currentMap.has(e.followed_user_id));

  // Find username or profile pic changes (same ID but different username or profile_pic_url)
  const usernameChanges = existing.filter(
    (e) => {
      const current = currentMap.get(e.followed_user_id);
      return current && (current.username !== e.followed_username || current.profile_pic_url !== e.profile_pic_url);
    }
  );

  // Insert new follows
  for (const user of newFollows) {
    await db.runAsync(
      `INSERT INTO followings (tracked_account_id, followed_user_id, followed_username, profile_pic_url, is_baseline, first_seen_at, last_seen_at, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trackedAccountId, user.id, user.username, user.profile_pic_url || null, isBaseline ? 1 : 0, now, now, now, now]
    );
  }

  // Mark unfollows
  for (const user of unfollows) {
    await db.runAsync(
      'UPDATE followings SET ended_at = ?, date_updated = ? WHERE tracked_account_id = ? AND followed_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.followed_user_id]
    );
  }

  // Update username/profile_pic changes and last_seen_at for existing active follows
  for (const user of currentUsers.filter((u) => existingMap.has(u.id))) {
    await db.runAsync(
      'UPDATE followings SET followed_username = ?, profile_pic_url = ?, last_seen_at = ?, date_updated = ? WHERE tracked_account_id = ? AND followed_user_id = ? AND ended_at IS NULL',
      [user.username, user.profile_pic_url || null, now, now, trackedAccountId, user.id]
    );
  }

  // Update sync state
  await db.runAsync(
    `INSERT INTO sync_state (instagram_user_id, has_completed_baseline, last_synced_at, date_created, date_updated)
     VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       has_completed_baseline = 1,
       last_synced_at = ?,
       date_updated = ?`,
    [trackedAccountId, now, now, now, now, now]
  );

  console.log(`Synced following for ${trackedAccountId}: +${newFollows.length} -${unfollows.length} ~${usernameChanges.length} (baseline: ${isBaseline})`);
};

/**
 * Sync followers list for an Instagram account
 * Handles baseline detection, change tracking, and storing in SQLite
 */
export const syncFollowersList = async (
  db: SQLite.SQLiteDatabase,
  trackedAccountId: string,
  currentUsers: User[]
): Promise<void> => {
  const now = getCurrentUTCTimestamp();

  // Check if baseline has been completed
  const syncState = await db.getFirstAsync<{ has_completed_baseline: number }>(
    'SELECT has_completed_baseline FROM sync_state WHERE instagram_user_id = ?',
    [trackedAccountId]
  );

  const isBaseline = !syncState || syncState.has_completed_baseline === 0;

  // Get existing followers that are still active
  const existing = await db.getAllAsync<{ follower_user_id: string; follower_username: string; profile_pic_url: string | null }>(
    'SELECT follower_user_id, follower_username, profile_pic_url FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
    [trackedAccountId]
  );

  const existingMap = new Map(existing.map((e) => [e.follower_user_id, { username: e.follower_username, profile_pic_url: e.profile_pic_url }]));
  const currentMap = new Map(currentUsers.map((u) => [u.id, { username: u.username, profile_pic_url: u.profile_pic_url }]));

  // Find new followers
  const newFollowers = currentUsers.filter((u) => !existingMap.has(u.id));

  // Find lost followers (existed before but not in current list)
  const lostFollowers = existing.filter((e) => !currentMap.has(e.follower_user_id));

  // Find username or profile pic changes
  const usernameChanges = existing.filter(
    (e) => {
      const current = currentMap.get(e.follower_user_id);
      return current && (current.username !== e.follower_username || current.profile_pic_url !== e.profile_pic_url);
    }
  );

  // Insert new followers
  for (const user of newFollowers) {
    await db.runAsync(
      `INSERT INTO followers (tracked_account_id, follower_user_id, follower_username, profile_pic_url, is_baseline, first_seen_at, last_seen_at, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [trackedAccountId, user.id, user.username, user.profile_pic_url || null, isBaseline ? 1 : 0, now, now, now, now]
    );
  }

  // Mark lost followers
  for (const user of lostFollowers) {
    await db.runAsync(
      'UPDATE followers SET ended_at = ?, date_updated = ? WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.follower_user_id]
    );
  }

  // Update username/profile_pic changes and last_seen_at for existing active followers
  for (const user of currentUsers.filter((u) => existingMap.has(u.id))) {
    await db.runAsync(
      'UPDATE followers SET follower_username = ?, profile_pic_url = ?, last_seen_at = ?, date_updated = ? WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL',
      [user.username, user.profile_pic_url || null, now, now, trackedAccountId, user.id]
    );
  }

  // Update sync state
  await db.runAsync(
    `INSERT INTO sync_state (instagram_user_id, has_completed_baseline, last_synced_at, date_created, date_updated)
     VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       has_completed_baseline = 1,
       last_synced_at = ?,
       date_updated = ?`,
    [trackedAccountId, now, now, now, now, now]
  );

  console.log(`Synced followers for ${trackedAccountId}: +${newFollowers.length} -${lostFollowers.length} ~${usernameChanges.length} (baseline: ${isBaseline})`);
};

/**
 * Get activity feed for a tracked account
 * Returns following changes grouped by date
 */
export const getFollowingActivity = async (
  db: SQLite.SQLiteDatabase,
  trackedUserId: string
): Promise<ActivityItem[]> => {
  // Get all following changes (excluding baseline)
  const newFollows = await db.getAllAsync<{
    followed_username: string;
    first_seen_at: string;
  }>(
    `SELECT followed_username, first_seen_at
     FROM followings
     WHERE tracked_account_id = ?
       AND is_baseline = 0
     ORDER BY first_seen_at DESC`,
    [trackedUserId]
  );

  const unfollows = await db.getAllAsync<{
    followed_username: string;
    ended_at: string;
  }>(
    `SELECT followed_username, ended_at
     FROM followings
     WHERE tracked_account_id = ?
       AND ended_at IS NOT NULL
     ORDER BY ended_at DESC`,
    [trackedUserId]
  );

  // Get the tracking start date (baseline date)
  const trackingStart = await db.getFirstAsync<{ date_created: string }>(
    `SELECT date_created
     FROM sync_state
     WHERE instagram_user_id = ?`,
    [trackedUserId]
  );

  // Group by date
  const activityByDate = new Map<string, ActivityItem>();

  // Add new follows
  newFollows.forEach((follow) => {
    const date = follow.first_seen_at.split('T')[0];
    if (!activityByDate.has(date)) {
      activityByDate.set(date, { date, newFollows: [], unfollows: [] });
    }
    activityByDate.get(date)!.newFollows.push(follow.followed_username);
  });

  // Add unfollows
  unfollows.forEach((unfollow) => {
    const date = unfollow.ended_at.split('T')[0];
    if (!activityByDate.has(date)) {
      activityByDate.set(date, { date, newFollows: [], unfollows: [] });
    }
    activityByDate.get(date)!.unfollows.push(unfollow.followed_username);
  });

  // Add tracking start date
  if (trackingStart) {
    const startDate = trackingStart.date_created.split('T')[0];
    if (!activityByDate.has(startDate)) {
      activityByDate.set(startDate, { date: startDate, newFollows: [], unfollows: [], isTrackingStart: true });
    } else {
      activityByDate.get(startDate)!.isTrackingStart = true;
    }
  }

  // Convert to array and sort by date descending
  return Array.from(activityByDate.values()).sort((a, b) => b.date.localeCompare(a.date));
};
