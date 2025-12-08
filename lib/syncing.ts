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

  // Upsert all users into instagrams table first
  for (const user of currentUsers) {
    await db.runAsync(
      `INSERT INTO instagrams (user_id, username, biography, profile_pic_url, media_count, followers_count, following_count, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         username = ?,
         profile_pic_url = ?,
         date_updated = ?`,
      [user.id, user.username, null, user.profile_pic_url || null, null, null, null, now, now, user.username, user.profile_pic_url || null, now]
    );
  }

  // Check if this is the first sync (baseline) by seeing if any followings exist for this account
  const existingCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followings WHERE tracked_account_id = ?',
    [trackedAccountId]
  );

  const isBaseline = existingCount?.count === 0;

  // Get existing followings that are still active
  const existing = await db.getAllAsync<{ followed_user_id: string }>(
    'SELECT followed_user_id FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
    [trackedAccountId]
  );

  const existingIds = new Set(existing.map((e) => e.followed_user_id));
  const currentIds = new Set(currentUsers.map((u) => u.id));

  // Find new follows
  const newFollows = currentUsers.filter((u) => !existingIds.has(u.id));

  // Find unfollows (existed before but not in current list)
  const unfollows = existing.filter((e) => !currentIds.has(e.followed_user_id));

  // Insert new follows
  for (const user of newFollows) {
    await db.runAsync(
      `INSERT INTO followings (tracked_account_id, followed_user_id, is_baseline, first_seen_at, last_seen_at, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tracked_account_id, followed_user_id) DO UPDATE SET
         last_seen_at = ?,
         ended_at = NULL,
         date_updated = ?`,
      [trackedAccountId, user.id, isBaseline ? 1 : 0, now, now, now, now, now, now]
    );
  }

  // Mark unfollows
  for (const user of unfollows) {
    await db.runAsync(
      'UPDATE followings SET ended_at = ?, date_updated = ? WHERE tracked_account_id = ? AND followed_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.followed_user_id]
    );
  }

  // Update last_seen_at for existing active follows
  for (const user of currentUsers.filter((u) => existingIds.has(u.id))) {
    await db.runAsync(
      'UPDATE followings SET last_seen_at = ?, date_updated = ? WHERE tracked_account_id = ? AND followed_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.id]
    );
  }

  // Update sync state
  // Set last_viewed_at on baseline to prevent baseline from showing as "new activity"
  const lastViewedAt = isBaseline ? now : null;
  await db.runAsync(
    `INSERT INTO sync_state (instagram_user_id, has_completed_baseline, last_synced_at, last_viewed_at, date_created, date_updated)
     VALUES (?, 1, ?, ?, ?, ?)
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       has_completed_baseline = 1,
       last_synced_at = ?,
       last_viewed_at = COALESCE(last_viewed_at, ?),
       date_updated = ?`,
    [trackedAccountId, now, lastViewedAt, now, now, now, lastViewedAt, now]
  );

  console.log(`Synced following for ${trackedAccountId}: +${newFollows.length} -${unfollows.length} (baseline: ${isBaseline})`);
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

  // Upsert all users into instagrams table first
  for (const user of currentUsers) {
    await db.runAsync(
      `INSERT INTO instagrams (user_id, username, biography, profile_pic_url, media_count, followers_count, following_count, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         username = ?,
         profile_pic_url = ?,
         date_updated = ?`,
      [user.id, user.username, null, user.profile_pic_url || null, null, null, null, now, now, user.username, user.profile_pic_url || null, now]
    );
  }

  // Check if this is the first sync (baseline) by seeing if any followers exist for this account
  const existingCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM followers WHERE tracked_account_id = ?',
    [trackedAccountId]
  );

  const isBaseline = existingCount?.count === 0;

  // Get existing followers that are still active
  const existing = await db.getAllAsync<{ follower_user_id: string }>(
    'SELECT follower_user_id FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
    [trackedAccountId]
  );

  const existingIds = new Set(existing.map((e) => e.follower_user_id));
  const currentIds = new Set(currentUsers.map((u) => u.id));

  // Find new followers
  const newFollowers = currentUsers.filter((u) => !existingIds.has(u.id));

  // Find lost followers (existed before but not in current list)
  const lostFollowers = existing.filter((e) => !currentIds.has(e.follower_user_id));

  // Insert new followers
  for (const user of newFollowers) {
    await db.runAsync(
      `INSERT INTO followers (tracked_account_id, follower_user_id, is_baseline, first_seen_at, last_seen_at, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tracked_account_id, follower_user_id) DO UPDATE SET
         last_seen_at = ?,
         ended_at = NULL,
         date_updated = ?`,
      [trackedAccountId, user.id, isBaseline ? 1 : 0, now, now, now, now, now, now]
    );
  }

  // Mark lost followers
  for (const user of lostFollowers) {
    await db.runAsync(
      'UPDATE followers SET ended_at = ?, date_updated = ? WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.follower_user_id]
    );
  }

  // Update last_seen_at for existing active followers
  for (const user of currentUsers.filter((u) => existingIds.has(u.id))) {
    await db.runAsync(
      'UPDATE followers SET last_seen_at = ?, date_updated = ? WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.id]
    );
  }

  // Update sync state
  // Set last_viewed_at on baseline to prevent baseline from showing as "new activity"
  const lastViewedAt = isBaseline ? now : null;
  await db.runAsync(
    `INSERT INTO sync_state (instagram_user_id, has_completed_baseline, last_synced_at, last_viewed_at, date_created, date_updated)
     VALUES (?, 1, ?, ?, ?, ?)
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       has_completed_baseline = 1,
       last_synced_at = ?,
       last_viewed_at = COALESCE(last_viewed_at, ?),
       date_updated = ?`,
    [trackedAccountId, now, lastViewedAt, now, now, now, lastViewedAt, now]
  );

  console.log(`Synced followers for ${trackedAccountId}: +${newFollowers.length} -${lostFollowers.length} (baseline: ${isBaseline})`);
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
    username: string;
    first_seen_at: string;
  }>(
    `SELECT i.username, f.first_seen_at
     FROM followings f
     JOIN instagrams i ON f.followed_user_id = i.user_id
     WHERE f.tracked_account_id = ?
       AND f.is_baseline = 0
     ORDER BY f.first_seen_at DESC`,
    [trackedUserId]
  );

  const unfollows = await db.getAllAsync<{
    username: string;
    ended_at: string;
  }>(
    `SELECT i.username, f.ended_at
     FROM followings f
     JOIN instagrams i ON f.followed_user_id = i.user_id
     WHERE f.tracked_account_id = ?
       AND f.ended_at IS NOT NULL
     ORDER BY f.ended_at DESC`,
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
    activityByDate.get(date)!.newFollows.push(follow.username);
  });

  // Add unfollows
  unfollows.forEach((unfollow) => {
    const date = unfollow.ended_at.split('T')[0];
    if (!activityByDate.has(date)) {
      activityByDate.set(date, { date, newFollows: [], unfollows: [] });
    }
    activityByDate.get(date)!.unfollows.push(unfollow.username);
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
