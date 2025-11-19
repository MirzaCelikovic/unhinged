import * as SQLite from 'expo-sqlite';
import { getCurrentUTCTimestamp } from './database';

interface User {
  id: string;
  username: string;
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
  const existing = await db.getAllAsync<{ followed_user_id: string; followed_username: string }>(
    'SELECT followed_user_id, followed_username FROM followings WHERE tracked_account_id = ? AND ended_at IS NULL',
    [trackedAccountId]
  );

  const existingMap = new Map(existing.map((e) => [e.followed_user_id, e.followed_username]));
  const currentMap = new Map(currentUsers.map((u) => [u.id, u.username]));

  // Find new follows
  const newFollows = currentUsers.filter((u) => !existingMap.has(u.id));

  // Find unfollows (existed before but not in current list)
  const unfollows = existing.filter((e) => !currentMap.has(e.followed_user_id));

  // Find username changes (same ID but different username)
  const usernameChanges = existing.filter(
    (e) => currentMap.has(e.followed_user_id) && currentMap.get(e.followed_user_id) !== e.followed_username
  );

  // Insert new follows
  for (const user of newFollows) {
    await db.runAsync(
      `INSERT INTO followings (tracked_account_id, followed_user_id, followed_username, is_baseline, first_seen_at, last_seen_at, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [trackedAccountId, user.id, user.username, isBaseline ? 1 : 0, now, now, now, now]
    );
  }

  // Mark unfollows
  for (const user of unfollows) {
    await db.runAsync(
      'UPDATE followings SET ended_at = ?, date_updated = ? WHERE tracked_account_id = ? AND followed_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.followed_user_id]
    );
  }

  // Update username changes and last_seen_at for existing active follows
  for (const user of currentUsers.filter((u) => existingMap.has(u.id))) {
    await db.runAsync(
      'UPDATE followings SET followed_username = ?, last_seen_at = ?, date_updated = ? WHERE tracked_account_id = ? AND followed_user_id = ? AND ended_at IS NULL',
      [user.username, now, now, trackedAccountId, user.id]
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
  const existing = await db.getAllAsync<{ follower_user_id: string; follower_username: string }>(
    'SELECT follower_user_id, follower_username FROM followers WHERE tracked_account_id = ? AND ended_at IS NULL',
    [trackedAccountId]
  );

  const existingMap = new Map(existing.map((e) => [e.follower_user_id, e.follower_username]));
  const currentMap = new Map(currentUsers.map((u) => [u.id, u.username]));

  // Find new followers
  const newFollowers = currentUsers.filter((u) => !existingMap.has(u.id));

  // Find lost followers (existed before but not in current list)
  const lostFollowers = existing.filter((e) => !currentMap.has(e.follower_user_id));

  // Find username changes
  const usernameChanges = existing.filter(
    (e) => currentMap.has(e.follower_user_id) && currentMap.get(e.follower_user_id) !== e.follower_username
  );

  // Insert new followers
  for (const user of newFollowers) {
    await db.runAsync(
      `INSERT INTO followers (tracked_account_id, follower_user_id, follower_username, is_baseline, first_seen_at, last_seen_at, date_created, date_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [trackedAccountId, user.id, user.username, isBaseline ? 1 : 0, now, now, now, now]
    );
  }

  // Mark lost followers
  for (const user of lostFollowers) {
    await db.runAsync(
      'UPDATE followers SET ended_at = ?, date_updated = ? WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL',
      [now, now, trackedAccountId, user.follower_user_id]
    );
  }

  // Update username changes and last_seen_at for existing active followers
  for (const user of currentUsers.filter((u) => existingMap.has(u.id))) {
    await db.runAsync(
      'UPDATE followers SET follower_username = ?, last_seen_at = ?, date_updated = ? WHERE tracked_account_id = ? AND follower_user_id = ? AND ended_at IS NULL',
      [user.username, now, now, trackedAccountId, user.id]
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
