import * as SQLite from 'expo-sqlite';

const CURRENT_DB_VERSION = 1;

// Migration functions
const migrations: { [version: number]: (db: SQLite.SQLiteDatabase) => Promise<void> } = {
  1: async (db: SQLite.SQLiteDatabase) => {
    await db.execAsync(`
      -- Track sync status for each Instagram account we're monitoring
      CREATE TABLE IF NOT EXISTS sync_state (
        instagram_user_id TEXT PRIMARY KEY,
        has_completed_baseline INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL
      );

      -- Track who each account is following
      CREATE TABLE IF NOT EXISTS followings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracked_account_id TEXT NOT NULL,
        followed_user_id TEXT NOT NULL,
        followed_username TEXT NOT NULL,
        profile_pic_url TEXT,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL,

        UNIQUE(tracked_account_id, followed_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_followings_tracked ON followings(tracked_account_id);
      CREATE INDEX IF NOT EXISTS idx_followings_active ON followings(tracked_account_id, ended_at);
      CREATE INDEX IF NOT EXISTS idx_followings_timeline ON followings(tracked_account_id, first_seen_at);

      -- Track who is following each account
      CREATE TABLE IF NOT EXISTS followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracked_account_id TEXT NOT NULL,
        follower_user_id TEXT NOT NULL,
        follower_username TEXT NOT NULL,
        profile_pic_url TEXT,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL,

        UNIQUE(tracked_account_id, follower_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_followers_tracked ON followers(tracked_account_id);
      CREATE INDEX IF NOT EXISTS idx_followers_active ON followers(tracked_account_id, ended_at);
      CREATE INDEX IF NOT EXISTS idx_followers_timeline ON followers(tracked_account_id, first_seen_at);
    `);
  },

  // Example for future migrations:
  // 2: async (db: SQLite.SQLiteDatabase) => {
  //   await db.execAsync(`
  //     ALTER TABLE sync_state ADD COLUMN new_column TEXT;
  //   `);
  // },
};

// Initialize database with migrations
export const initializeDatabase = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // Get current version
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = result?.user_version || 0;

  // Run migrations
  if (currentVersion < CURRENT_DB_VERSION) {
    for (let version = currentVersion + 1; version <= CURRENT_DB_VERSION; version++) {
      const migration = migrations[version];
      if (migration) {
        await migration(db);
      }
    }

    // Update version
    await db.execAsync(`PRAGMA user_version = ${CURRENT_DB_VERSION}`);
  }
};

// Get current UTC timestamp in ISO 8601 format
export const getCurrentUTCTimestamp = (): string => {
  return new Date().toISOString();
};

// Clear all data from the database (for account mismatch scenarios)
export const clearAllData = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    DELETE FROM followings;
    DELETE FROM followers;
    DELETE FROM sync_state;
  `);
};
