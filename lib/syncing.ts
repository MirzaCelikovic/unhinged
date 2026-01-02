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
 * Handles baseline detection, change tracking, stability tracking, and storing in SQLite
 *
 * Stability tracking:
 * - times_seen: how many syncs this follower has appeared in
 * - total_syncs: how many syncs have occurred since first seen
 * - consecutive_misses: current streak of missed syncs (reset when seen)
 *
 * Due to Instagram API unreliability (~25% of followers randomly missing each fetch),
 * we only mark a follower as "lost" when they have high stability (>90% appearance rate)
 * AND have missed multiple consecutive syncs.
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

  // Get ALL existing followers (including those with ended_at set, to handle re-appearances)
  const allExisting = await db.getAllAsync<{ follower_user_id: string; ended_at: string | null }>(
    'SELECT follower_user_id, ended_at FROM followers WHERE tracked_account_id = ?',
    [trackedAccountId]
  );

  const existingMap = new Map(allExisting.map((e) => [e.follower_user_id, e]));
  const currentIds = new Set(currentUsers.map((u) => u.id));

  // Find truly new followers (never seen before)
  const newFollowers = currentUsers.filter((u) => !existingMap.has(u.id));

  // Find followers that are re-appearing (were marked as ended but now back)
  const reappearing = currentUsers.filter((u) => {
    const existing = existingMap.get(u.id);
    return existing && existing.ended_at !== null;
  });

  // Find followers not in current fetch
  const missingFollowers = allExisting.filter(
    (e) => e.ended_at === null && !currentIds.has(e.follower_user_id)
  );

  // Insert truly new followers
  for (const user of newFollowers) {
    await db.runAsync(
      `INSERT INTO followers (tracked_account_id, follower_user_id, is_baseline, first_seen_at, last_seen_at, times_seen, total_syncs, consecutive_misses, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`,
      [trackedAccountId, user.id, isBaseline ? 1 : 0, now, now, now, now]
    );
  }

  // Handle re-appearing followers (were ended, now back)
  for (const user of reappearing) {
    await db.runAsync(
      `UPDATE followers SET
         last_seen_at = ?,
         ended_at = NULL,
         times_seen = times_seen + 1,
         total_syncs = total_syncs + 1,
         consecutive_misses = 0,
         date_updated = ?
       WHERE tracked_account_id = ? AND follower_user_id = ?`,
      [now, now, trackedAccountId, user.id]
    );
  }

  // Update seen followers (in current fetch and were already active)
  const seenFollowers = currentUsers.filter((u) => {
    const existing = existingMap.get(u.id);
    return existing && existing.ended_at === null;
  });

  for (const user of seenFollowers) {
    await db.runAsync(
      `UPDATE followers SET
         last_seen_at = ?,
         times_seen = times_seen + 1,
         total_syncs = total_syncs + 1,
         consecutive_misses = 0,
         date_updated = ?
       WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL`,
      [now, now, trackedAccountId, user.id]
    );
  }

  // Handle missing followers - increment consecutive_misses and total_syncs
  // Only mark as ended if stability is high AND consecutive_misses threshold reached
  const STABILITY_THRESHOLD = 0.9; // Must have appeared in 90%+ of syncs
  const CONSECUTIVE_MISS_THRESHOLD = 3; // Must miss 3 syncs in a row

  for (const follower of missingFollowers) {
    // Get current stats
    const stats = await db.getFirstAsync<{ times_seen: number; total_syncs: number; consecutive_misses: number }>(
      'SELECT times_seen, total_syncs, consecutive_misses FROM followers WHERE tracked_account_id = ? AND follower_user_id = ?',
      [trackedAccountId, follower.follower_user_id]
    );

    if (!stats) continue;

    const newTotalSyncs = stats.total_syncs + 1;
    const newConsecutiveMisses = stats.consecutive_misses + 1;
    const stabilityScore = stats.times_seen / newTotalSyncs;

    // Check if we should mark as lost
    const shouldMarkAsLost =
      stabilityScore >= STABILITY_THRESHOLD && newConsecutiveMisses >= CONSECUTIVE_MISS_THRESHOLD;

    if (shouldMarkAsLost) {
      // High stability user has missed enough syncs - mark as lost
      await db.runAsync(
        `UPDATE followers SET
           ended_at = ?,
           total_syncs = ?,
           consecutive_misses = ?,
           date_updated = ?
         WHERE tracked_account_id = ? AND follower_user_id = ?`,
        [now, newTotalSyncs, newConsecutiveMisses, now, trackedAccountId, follower.follower_user_id]
      );
    } else {
      // Just increment counters, don't mark as lost yet
      await db.runAsync(
        `UPDATE followers SET
           total_syncs = ?,
           consecutive_misses = ?,
           date_updated = ?
         WHERE tracked_account_id = ? AND follower_user_id = ?`,
        [newTotalSyncs, newConsecutiveMisses, now, trackedAccountId, follower.follower_user_id]
      );
    }
  }

  // Update sync state
  // Set last_viewed_at on baseline to prevent baseline from showing as "new activity"
  const lastViewedAt = isBaseline ? now : null;
  await db.runAsync(
    `INSERT INTO sync_state (instagram_user_id, has_completed_baseline, total_syncs, last_synced_at, last_viewed_at, date_created, date_updated)
     VALUES (?, 1, 1, ?, ?, ?, ?)
     ON CONFLICT(instagram_user_id) DO UPDATE SET
       has_completed_baseline = 1,
       total_syncs = total_syncs + 1,
       last_synced_at = ?,
       last_viewed_at = COALESCE(last_viewed_at, ?),
       date_updated = ?`,
    [trackedAccountId, now, lastViewedAt, now, now, now, lastViewedAt, now]
  );

  console.log(`Synced followers for ${trackedAccountId}: +${newFollowers.length} reappeared:${reappearing.length} missing:${missingFollowers.length} (baseline: ${isBaseline})`);
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
