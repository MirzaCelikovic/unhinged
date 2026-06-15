import * as SQLite from 'expo-sqlite';

const CURRENT_DB_VERSION = 3;

// Helper to check if a column exists on a table
const hasColumn = async (db: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> => {
  const tableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return tableInfo.some((c) => c.name === column);
};

// Migration functions — each must be idempotent (safe to re-run)
const migrations: { [version: number]: (db: SQLite.SQLiteDatabase) => Promise<void> } = {
  1: async (db: SQLite.SQLiteDatabase) => {
    await db.execAsync(`
      -- Master table of all Instagram users we've encountered
      CREATE TABLE IF NOT EXISTS instagrams (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        full_name TEXT,
        biography TEXT,
        profile_pic_url TEXT,
        media_count INTEGER,
        followers_count INTEGER,
        following_count INTEGER,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_instagrams_username ON instagrams(username);

      -- Track sync status for each Instagram account we're monitoring
      CREATE TABLE IF NOT EXISTS sync_state (
        instagram_user_id TEXT PRIMARY KEY,
        has_completed_baseline INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        last_viewed_at TEXT,
        last_viewed_gained_followers_at TEXT,
        last_viewed_lost_followers_at TEXT,
        last_viewed_added_following_at TEXT,
        last_viewed_removed_following_at TEXT,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL
      );

      -- Track who each account is following
      CREATE TABLE IF NOT EXISTS followings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracked_account_id TEXT NOT NULL,
        followed_user_id TEXT NOT NULL,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL,

        UNIQUE(tracked_account_id, followed_user_id),
        FOREIGN KEY(followed_user_id) REFERENCES instagrams(user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_followings_tracked ON followings(tracked_account_id);
      CREATE INDEX IF NOT EXISTS idx_followings_active ON followings(tracked_account_id, ended_at);
      CREATE INDEX IF NOT EXISTS idx_followings_timeline ON followings(tracked_account_id, first_seen_at);

      -- Track who is following each account
      CREATE TABLE IF NOT EXISTS followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracked_account_id TEXT NOT NULL,
        follower_user_id TEXT NOT NULL,
        is_baseline INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ended_at TEXT,
        date_created TEXT NOT NULL,
        date_updated TEXT NOT NULL,

        UNIQUE(tracked_account_id, follower_user_id),
        FOREIGN KEY(follower_user_id) REFERENCES instagrams(user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_followers_tracked ON followers(tracked_account_id);
      CREATE INDEX IF NOT EXISTS idx_followers_active ON followers(tracked_account_id, ended_at);
      CREATE INDEX IF NOT EXISTS idx_followers_timeline ON followers(tracked_account_id, first_seen_at);
    `);
  },

  2: async (db: SQLite.SQLiteDatabase) => {
    if (!(await hasColumn(db, 'sync_state', 'followers_sync_disabled'))) {
      await db.execAsync(
        `ALTER TABLE sync_state ADD COLUMN followers_sync_disabled INTEGER NOT NULL DEFAULT 0`
      );
    }
    if (!(await hasColumn(db, 'sync_state', 'following_sync_disabled'))) {
      await db.execAsync(
        `ALTER TABLE sync_state ADD COLUMN following_sync_disabled INTEGER NOT NULL DEFAULT 0`
      );
    }

    // For existing tracked accounts with 5K+ followers, disable follower sync
    await db.execAsync(`
      UPDATE sync_state
      SET followers_sync_disabled = 1
      WHERE instagram_user_id IN (
        SELECT user_id FROM instagrams WHERE followers_count >= 3000
      )
    `);
  },

  3: async (db: SQLite.SQLiteDatabase) => {
    if (!(await hasColumn(db, 'sync_state', 'circuit_breaker_cooldown_until'))) {
      await db.execAsync(
        `ALTER TABLE sync_state ADD COLUMN circuit_breaker_cooldown_until TEXT`
      );
    }
  },
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

  console.log(`📦 DB version: ${currentVersion}, target: ${CURRENT_DB_VERSION}`);

  // Run migrations one at a time, updating version after each succeeds
  for (let version = currentVersion + 1; version <= CURRENT_DB_VERSION; version++) {
    const migration = migrations[version];
    if (migration) {
      console.log(`📦 Running migration ${version}...`);
      try {
        await migration(db);
        await db.execAsync(`PRAGMA user_version = ${version}`);
        console.log(`✅ Migration ${version} complete`);
      } catch (error) {
        console.error(`❌ Migration ${version} failed:`, error);
        throw error; // Don't continue with further migrations
      }
    }
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
    DELETE FROM instagrams;
  `);
};
