// Unit tests for the Follow Backs detection logic (specs/red-flags-follow-backs.md).
// Run via `npm test` (node + sucrase, no external test runner required).

import assert from 'node:assert/strict';
import {
  deriveFollowBacks,
  getFollowBackCount,
  getFollowBacks,
  type FollowBackDb,
  type FollowBackRow,
} from './followBacks';

type Case = { name: string; fn: () => void | Promise<void> };
const cases: Case[] = [];
const test = (name: string, fn: () => void | Promise<void>) => cases.push({ name, fn });

const follower = (
  user_id: string,
  is_baseline: number,
  first_seen_at: string | null = '2026-01-01T00:00:00Z'
): FollowBackRow => ({ user_id, is_baseline, first_seen_at });

// --- deriveFollowBacks --------------------------------------------------------

test('mutual follow with both sides new -> both_new', () => {
  const result = deriveFollowBacks([follower('x', 0)], [follower('x', 0)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].connection_type, 'both_new');
});

test('follower new, following baseline -> they_followed_first', () => {
  const result = deriveFollowBacks([follower('x', 0)], [follower('x', 1)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].connection_type, 'they_followed_first');
});

test('follower baseline, following new -> crush_followed_first', () => {
  const result = deriveFollowBacks([follower('x', 1)], [follower('x', 0)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].connection_type, 'crush_followed_first');
});

test('both sides baseline -> not a new follow back', () => {
  const result = deriveFollowBacks([follower('x', 1)], [follower('x', 1)]);
  assert.equal(result.length, 0);
});

test('one-way follow (no mutual) -> excluded', () => {
  const result = deriveFollowBacks([follower('x', 0)], [follower('y', 0)]);
  assert.equal(result.length, 0);
});

test('connection_date is MAX of the two first_seen_at values', () => {
  const result = deriveFollowBacks(
    [follower('x', 0, '2026-03-01T00:00:00Z')],
    [follower('x', 1, '2026-05-01T00:00:00Z')]
  );
  assert.equal(result[0].connection_date, '2026-05-01T00:00:00Z');
});

test('results are ordered by connection_date DESC', () => {
  const followers = [
    follower('old', 0, '2026-01-01T00:00:00Z'),
    follower('new', 0, '2026-09-01T00:00:00Z'),
  ];
  const followings = [
    follower('old', 0, '2026-01-01T00:00:00Z'),
    follower('new', 0, '2026-09-01T00:00:00Z'),
  ];
  const result = deriveFollowBacks(followers, followings);
  assert.deepEqual(
    result.map((c) => c.user_id),
    ['new', 'old']
  );
});

// --- getFollowBackCount / getFollowBacks (with a fake DB) ---------------------

// Minimal fake DB that answers the two relationship queries and the profile
// lookup, dispatching on the table named in the SQL.
const makeDb = (
  followers: FollowBackRow[],
  followings: FollowBackRow[],
  profiles: { user_id: string; username: string | null; full_name: string | null; profile_pic_url: string | null }[] = []
): FollowBackDb => ({
  async getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]> {
    if (source.includes('FROM followers')) return followers as unknown as T[];
    if (source.includes('FROM followings')) return followings as unknown as T[];
    if (source.includes('FROM instagrams')) {
      const ids = new Set(params.map(String));
      return profiles.filter((p) => ids.has(p.user_id)) as unknown as T[];
    }
    return [];
  },
});

test('getFollowBackCount counts only new mutual follows', async () => {
  const db = makeDb(
    [follower('a', 0), follower('b', 1), follower('c', 0)],
    [follower('a', 0), follower('b', 1), follower('d', 0)]
  );
  // a: both new (counts). b: both baseline (excluded). c/d: one-way (excluded).
  assert.equal(await getFollowBackCount(db, 'tracked'), 1);
});

test('getFollowBacks enriches connections with profile metadata', async () => {
  const db = makeDb(
    [follower('a', 0)],
    [follower('a', 1)],
    [{ user_id: 'a', username: 'mystery', full_name: 'Mystery Person', profile_pic_url: 'http://pic' }]
  );
  const result = await getFollowBacks(db, 'tracked');
  assert.equal(result.length, 1);
  assert.equal(result[0].username, 'mystery');
  assert.equal(result[0].full_name, 'Mystery Person');
  assert.equal(result[0].connection_type, 'they_followed_first');
});

test('getFollowBacks returns [] when there are no new mutual follows', async () => {
  const db = makeDb([follower('a', 1)], [follower('a', 1)]);
  assert.deepEqual(await getFollowBacks(db, 'tracked'), []);
});

// --- runner -------------------------------------------------------------------

(async () => {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.fn();
      console.log(`  ✓ ${c.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${c.name}`);
      console.error(err instanceof Error ? err.message : err);
    }
  }
  const total = cases.length;
  console.log(`\n${total - failed}/${total} passed`);
  if (failed > 0) process.exit(1);
})();
