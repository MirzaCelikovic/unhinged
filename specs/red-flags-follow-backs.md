# Red Flags: Follow Backs

## Overview

Detect when a tracked account and another user start following each other (mutual follow). This is high-signal activity that often indicates a new relationship forming - they met, they're talking, something is happening.

## Terminology

- **Feature name:** Follow Backs
- **Internal:** `new_connection` / `follow_back`
- **UI copy:** "they follow each other now", "new follow back"

## User Value

This is the highest-signal event we can detect. One-way follows are noise (following brands, celebrities, random accounts). But when two real people follow each other, it often means:
- They met somewhere (party, work, dating app)
- DMs went well
- A friend introduced them
- They're dating

This is the notification that makes users frantically open the app.

## Data Model

### Existing Schema (no changes needed)

**`followers` table:**
- `tracked_account_id` - who we're tracking
- `follower_user_id` - who follows them
- `first_seen_at` - when we first saw this
- `is_baseline` - existed on first sync
- `ended_at` - null if still active

**`followings` table:**
- `tracked_account_id` - who we're tracking
- `followed_user_id` - who they follow
- `first_seen_at` - when we first saw this
- `is_baseline` - existed on first sync
- `ended_at` - null if still active

### Detection Logic

A "follow back" exists when:
1. Person X appears in tracked account's followers (X follows them)
2. Person X appears in tracked account's following (they follow X)
3. Both relationships are active (`ended_at IS NULL`)

A "new follow back" is when:
1. Above conditions are met, AND
2. At least one side is non-baseline (`is_baseline = 0`)

### Query

```sql
-- Get new follow backs for a tracked account
SELECT
  i.user_id,
  i.username,
  i.profile_pic_url,
  i.biography,
  i.followers_count,
  i.following_count,
  f.first_seen_at as follower_first_seen,
  g.first_seen_at as following_first_seen,
  MAX(f.first_seen_at, g.first_seen_at) as connection_date,
  CASE
    WHEN f.is_baseline = 0 AND g.is_baseline = 0 THEN 'both_new'
    WHEN f.is_baseline = 0 THEN 'they_followed_first'
    WHEN g.is_baseline = 0 THEN 'crush_followed_first'
  END as connection_type
FROM followers f
INNER JOIN followings g
  ON f.follower_user_id = g.followed_user_id
  AND f.tracked_account_id = g.tracked_account_id
INNER JOIN instagrams i
  ON i.user_id = f.follower_user_id
WHERE f.tracked_account_id = ?
  AND f.ended_at IS NULL
  AND g.ended_at IS NULL
  AND (f.is_baseline = 0 OR g.is_baseline = 0)
ORDER BY connection_date DESC
```

## Display

### Activity Feed (Activity tab)

Add new event type to `ActivityFeed.tsx`:

```typescript
type: 'new_follower' | 'lost_follower' | 'started_following' | 'stopped_following' | 'follow_back'
```

**UI Treatment:**
- Highlighted/pinned at top when new
- Different visual treatment (emoji, color, badge)
- Label: "they follow each other now" or "new follow back"

```
┌─────────────────────────────────────┐
│ [pic] @mysteryperson                │
│ 👀 they follow each other    2h ago │
└─────────────────────────────────────┘
```

### Insights Tab (ActivityList)

Add new row to insights:

```typescript
const items = [
  { type: 'followBacks', count: stats.followBacks },  // NEW
  { type: 'addedFollowing', count: stats.addedFollowing },
  // ... existing items
];
```

**Label:** "Follow backs"
**Drill-down:** List of all follow back connections

### Push Notifications

When a new follow back is detected during sync:

> "@crush and @mysteryperson now follow each other"

Or more dramatic:
> "👀 @crush has a new connection"

## Implementation Steps

### 1. Add query helper
Create `lib/useFollowBacks.ts` or add to `useFollowerStats.ts`:
- `getFollowBacks(db, trackedAccountId)` - returns list
- `getFollowBackCount(db, trackedAccountId)` - returns count

### 2. Update ActivityFeed
- Add `follow_back` event type
- Query for new follow backs in `fetchActivityFeed()`
- Add to events array with high priority sorting

### 3. Update ActivityList (Insights)
- Add `followBacks` to `FollowerStats` type
- Add row to insights list
- Create list view for drill-down

### 4. Update useFollowerStats hook
- Add `followBacks` count to stats query

### 5. Push notifications (future)
- Detect new follow backs during sync
- Trigger notification via Customer.io

## Paywall Strategy

**Free tier:**
- See that follow backs exist (count blurred)
- "X new connections detected" (paywalled reveal)

**Paid tier:**
- See full list with usernames
- Push notifications for new follow backs
- Tap to view profile

## Edge Cases

1. **First sync (baseline):** All existing mutuals are marked as baseline, no alerts
2. **Both follow same sync:** Both `is_baseline = 0`, show as new connection
3. **Unfollow then re-follow:** Creates new record, would show as new (acceptable)
4. **One unfollows:** `ended_at` set on one side, no longer a "follow back"

## Success Metrics

- Tap rate on follow back events vs other events
- Conversion rate from follow back notification to paid
- Retention of users who receive follow back alerts

## Future Enhancements

- "Connection strength" - how long they've been mutual
- "Who followed first" - shows who initiated
- Filter by recency (last 24h, last week)
- Account categorization (is this person suspicious?)
