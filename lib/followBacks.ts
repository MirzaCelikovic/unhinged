// Red Flags: Follow Backs — mutual-follow detection.
// See specs/red-flags-follow-backs.md.
//
// A "follow back" is a mutual follow: person X appears in a tracked account's
// active followers AND in its active following. A "new follow back" is a mutual
// follow where at least one side is non-baseline (i.e. formed after the first
// sync) — that is the high-signal "they follow each other now" event.
//
// The detection lives here as pure, dependency-free logic (no react-native /
// expo-sqlite imports) so it can be unit-tested without the RN runtime.

export type FollowBackConnectionType =
  // both sides formed after baseline (they started following each other now)
  | 'both_new'
  // the other person started following the tracked account first
  | 'they_followed_first'
  // the tracked account ("crush") started following the other person first
  | 'crush_followed_first';

export interface FollowBackRow {
  user_id: string;
  is_baseline: number;
  first_seen_at: string | null;
}

export interface FollowBackConnection {
  user_id: string;
  connection_type: FollowBackConnectionType;
  // MAX(follower.first_seen_at, following.first_seen_at) — when the mutual
  // connection completed. ISO-8601 strings sort chronologically.
  connection_date: string | null;
}

export interface FollowBack extends FollowBackConnection {
  username: string | null;
  full_name: string | null;
  profile_pic_url: string | null;
}

// Minimal structural subset of expo-sqlite's SQLiteDatabase, kept local so this
// module carries no react-native imports. The real SQLiteDatabase satisfies it.
export interface FollowBackDb {
  getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]>;
}

const isNew = (row: FollowBackRow): boolean => row.is_baseline === 0;

// MAX of two nullable ISO timestamps (lexicographic == chronological).
const maxDate = (a: string | null, b: string | null): string | null => {
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
};

/**
 * Detect NEW follow backs from a tracked account's active follower and
 * following rows. Only mutual pairs where at least one side is non-baseline are
 * returned, ordered by connection_date DESC (most recent connection first).
 */
export const deriveFollowBacks = (
  followers: FollowBackRow[],
  followings: FollowBackRow[]
): FollowBackConnection[] => {
  const followingById = new Map(followings.map((g) => [g.user_id, g]));
  const connections: FollowBackConnection[] = [];

  for (const follower of followers) {
    const following = followingById.get(follower.user_id);
    if (!following) continue; // one-way follow — not a follow back

    const followerNew = isNew(follower);
    const followingNew = isNew(following);
    if (!followerNew && !followingNew) continue; // both baseline — not a NEW follow back

    const connection_type: FollowBackConnectionType =
      followerNew && followingNew
        ? 'both_new'
        : followerNew
          ? 'they_followed_first'
          : 'crush_followed_first';

    connections.push({
      user_id: follower.user_id,
      connection_type,
      connection_date: maxDate(follower.first_seen_at, following.first_seen_at),
    });
  }

  return connections.sort((a, b) =>
    (b.connection_date ?? '').localeCompare(a.connection_date ?? '')
  );
};

const fetchConnections = async (
  db: FollowBackDb,
  trackedAccountId: string
): Promise<FollowBackConnection[]> => {
  const followers = await db.getAllAsync<FollowBackRow>(
    `SELECT follower_user_id AS user_id, is_baseline, first_seen_at
     FROM followers
     WHERE tracked_account_id = ? AND ended_at IS NULL`,
    [trackedAccountId]
  );
  const followings = await db.getAllAsync<FollowBackRow>(
    `SELECT followed_user_id AS user_id, is_baseline, first_seen_at
     FROM followings
     WHERE tracked_account_id = ? AND ended_at IS NULL`,
    [trackedAccountId]
  );
  return deriveFollowBacks(followers, followings);
};

/** Number of new follow backs for a tracked account. */
export const getFollowBackCount = async (
  db: FollowBackDb,
  trackedAccountId: string
): Promise<number> => (await fetchConnections(db, trackedAccountId)).length;

/** New follow backs for a tracked account, enriched with profile metadata. */
export const getFollowBacks = async (
  db: FollowBackDb,
  trackedAccountId: string
): Promise<FollowBack[]> => {
  const connections = await fetchConnections(db, trackedAccountId);
  if (connections.length === 0) return [];

  const placeholders = connections.map(() => '?').join(', ');
  const profiles = await db.getAllAsync<{
    user_id: string;
    username: string | null;
    full_name: string | null;
    profile_pic_url: string | null;
  }>(
    `SELECT user_id, username, full_name, profile_pic_url
     FROM instagrams
     WHERE user_id IN (${placeholders})`,
    connections.map((c) => c.user_id)
  );
  const byId = new Map(profiles.map((p) => [p.user_id, p]));

  return connections.map((c) => {
    const profile = byId.get(c.user_id);
    return {
      ...c,
      username: profile?.username ?? null,
      full_name: profile?.full_name ?? null,
      profile_pic_url: profile?.profile_pic_url ?? null,
    };
  });
};
