# Unhinged - Instagram Activity Tracker

## Overview

Unhinged is a React Native (Expo) app that allows users to privately track Instagram accounts and monitor follower/following activity. Users connect their Instagram account via webview login, and the app uses JavaScript injection to interact with Instagram's private APIs to fetch follower/following data. This data is stored locally in SQLite and synced periodically.

**Target Use Case:** Relationship/social monitoring - tracking specific people's Instagram activity (crushes, partners, friends).

## Tech Stack

- **Framework:** React Native with Expo SDK 54
- **Routing:** expo-router (file-based routing)
- **Styling:** NativeWind (TailwindCSS for React Native)
- **State Management:** React Context + TanStack Query (react-query)
- **Local Database:** expo-sqlite (SQLite with migrations)
- **Payments:** RevenueCat (react-native-purchases + react-native-purchases-ui)
- **Analytics:** Amplitude, Customer.io, Meta/Facebook SDK
- **Notifications:** expo-notifications + Customer.io push

## Project Structure

```
app/                    # Expo Router screens
├── _layout.tsx         # Root layout with providers
├── index.tsx           # Redirects to home
├── start.tsx           # Pre-onboarding start screen
└── (tabs)/             # Main tab navigation
    ├── home/           # Main account view
    ├── tracking/       # Tracked accounts list & detail
    └── settings/       # App settings

components/             # Reusable UI components
├── onboarding/         # Onboarding flow components
├── ActivityList.tsx    # Activity feed display
├── InstagramCard.tsx   # Account card component
└── ...

contexts/               # React Context providers
├── InstagramContext.tsx    # Instagram auth & API (WebView)
├── AccountContext.tsx      # User account state
├── RevenueCatContext.tsx   # Subscription management
└── AnalyticsContext.tsx    # Analytics (Amplitude, Customer.io, Meta)

lib/                    # Business logic & utilities
├── api.ts              # Backend API client (axios)
├── database.ts         # SQLite schema & migrations
├── syncing.ts          # Follower/following sync logic
├── useInstagram.ts     # Instagram data hooks
├── useFollowerStats.ts # Follower statistics hooks
├── useInstagramActivity.ts # Activity tracking hooks
└── types.ts            # TypeScript types

assets/                 # Images, fonts, SVGs
```

## Core Concepts

### Instagram Integration (InstagramContext.tsx)

The app uses a hidden WebView to interact with Instagram's web APIs. Key mechanisms:

1. **Login:** User logs in via Instagram's web login page in a modal WebView. The app polls for `ds_user_id` cookie to detect successful login.

2. **API WebView:** A hidden WebView (always mounted) is used for all API calls. JavaScript is injected to create `window.instagramAPI` with methods:
   - `fetchFollowing(userId)` / `fetchFollowingGraphQL(userId)`
   - `fetchFollowers(userId)` / `fetchFollowersGraphQL(userId)`
   - `fetchAccountMetadata(username)`
   - `fetchUserId(username)`
   - `followUser(userId)` / `unfollowUser(userId)`
   - `checkLoginStatus(userId)`
   - `logout(userId)`

3. **Message Passing:** WebView communicates with React Native via `window.ReactNativeWebView.postMessage()`. The context handles messages like `LOGIN_SUCCESS`, `FOLLOWING_COMPLETE`, `FOLLOWERS_COMPLETE`, etc.

4. **Session Handling:** Session expiration is detected and prompts user to reconnect.

### Data Syncing (syncing.ts)

Data sync happens on-device by fetching Instagram's API through the WebView:

1. **Baseline Detection:** First sync marks all followers/following as "baseline" (is_baseline=1). Only subsequent changes are tracked as activity.

2. **Following Sync:** Compares current following list with stored data. New follows get `first_seen_at`, unfollows get `ended_at`.

3. **Followers Sync:** Same pattern for followers.

4. **Activity Tracking:** Changes since `last_viewed_at` are shown as "new activity" with badge indicators.

### SQLite Schema (database.ts)

```sql
-- All Instagram users encountered
instagrams (user_id, username, full_name, biography, profile_pic_url, ...)

-- Sync state per tracked account
sync_state (instagram_user_id, has_completed_baseline, last_synced_at, last_viewed_at, ...)

-- Following relationships (who each tracked account follows)
followings (tracked_account_id, followed_user_id, is_baseline, first_seen_at, ended_at, ...)

-- Follower relationships (who follows each tracked account)
followers (tracked_account_id, follower_user_id, is_baseline, first_seen_at, ended_at, ...)
```

### Backend API

Base URL: `https://api-prod.unhinged.so`

The backend handles:
- Account creation/management (`/api/v1/account/`)
- Instagram connection tracking (`/api/v1/account/{uuid}/instagram/`)
- Tracked accounts list (`/api/v1/account/{uuid}/tracks/`)
- Account settings (`/api/v1/account/{uuid}/settings/`)
- Activity notifications (`latest_activity_date` in account response indicates new activity since last sync)

### RevenueCat Integration (RevenueCatContext.tsx)

- Entitlement: `"Unhinged Subscription"`
- Products: weekly, monthly, yearly
- Paywall shown on launch for non-subscribers
- Non-paying users limited to tracking 1 account
- Paying users can track up to 5 accounts

### Onboarding Flow (components/Onboarding.tsx)

Multi-step onboarding:
1. Source attribution (HDYHAU)
2. Username search (preview)
3. Feature interest
4. Track account search (preview)
5. Help screens (2)
6. Notification consent
7. App review prompt
8. Stats/comparison screens
9. Instagram connect

## Key Files

| File | Purpose |
|------|---------|
| `contexts/InstagramContext.tsx` | Core Instagram WebView integration, login, API calls, sync orchestration |
| `lib/syncing.ts` | Follower/following diff logic, SQLite updates |
| `lib/useFollowerStats.ts` | Statistics calculations (who unfollowed, not following back, etc.) |
| `lib/useInstagramActivity.ts` | New activity detection, category tracking |
| `contexts/AccountContext.tsx` | User account state, tracked accounts, settings |
| `contexts/RevenueCatContext.tsx` | Subscription state, paywall presentation |
| `lib/database.ts` | SQLite schema, migrations, initialization |

## Development

### Environment Variables

The app requires a `.env` file with API keys for RevenueCat, Amplitude, Customer.io, Facebook SDK, and support URLs. See `.env` for required variables.

### Running

```bash
npm install
npm start           # Start Expo
npm run ios         # Run on iOS
npm run android     # Run on Android
```

### Building

```bash
npm run prebuild:ios    # Generate native iOS project
npm run build:ios       # Build iOS locally via EAS
npm run submit:ios      # Submit to App Store
```

## Important Notes

1. **Rate Limiting:** GraphQL API methods have a 1s delay between pagination requests (REST methods have no delay). Currently configured to use GraphQL. Users are warned about refreshing too frequently. **TODO:** Investigate if 1s delay is really necessary - seems excessive.

2. **Session Management:** Instagram sessions expire. The app detects this and shows a reconnect prompt.

3. **Account Mismatch:** If a user logs into a different Instagram account than before, all local data is cleared.

4. **GraphQL vs REST:** Both GraphQL and REST API methods are available for fetching followers/following. Currently configured to use GraphQL.

5. **Baseline Prevention:** Initial sync data is marked as baseline to avoid showing the entire follower list as "new followers" on first sync.

6. **Activity Categories:** Activity is tracked separately for 4 categories: gained followers, lost followers, added following, removed following. Each has its own `last_viewed_at` timestamp.

## Common Tasks

### Adding a New Screen

1. Create file in `app/` directory (file-based routing)
2. Add to navigation if needed in `_layout.tsx`

### Adding a New API Endpoint

1. Add function in relevant hook file (e.g., `lib/useAccount.ts`)
2. Use `useApi()` hook for axios instance
3. Create react-query hook for caching

### Modifying Instagram API Calls

1. Update the JavaScript string in `InstagramContext.tsx` (`instagramAPI` const)
2. Add message type handling in `handleMessage`
3. Add corresponding React Native method if needed

### Database Migrations

1. Increment `CURRENT_DB_VERSION` in `lib/database.ts`
2. Add migration function to `migrations` object
3. Migrations run automatically on app start

## Commit Guidelines

- Do not add `Co-Authored-By` lines to commit messages.
