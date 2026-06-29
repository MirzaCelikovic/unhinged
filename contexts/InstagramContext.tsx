import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Modal, Text, Pressable, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSQLiteContext } from 'expo-sqlite';
import { useQueryClient } from '@tanstack/react-query';
import { useStorage } from '~/lib/useStorage';
import { useConnectInstagram, useDisconnectInstagram } from '~/lib/useAccount';
import { useAccountContext } from './AccountContext';
import { syncFollowingList, syncFollowersList, addFollowing, removeFollowing } from '~/lib/syncing';
import { clearAllData } from '~/lib/database';
import * as Notifications from 'expo-notifications';
import { analytics, Events } from '~/contexts/AnalyticsContext';

// Constants
const INSTAGRAM_APP_ID = '936619743392459';
const COOKIE_POLL_INTERVAL_MS = 1000;
const LOGIN_CHECK_DELAY_MS = 500;
const FETCH_FOLLOWING_DELAY_MS = 1000;
// Circuit-breaker cooldown: how long syncing stays paused after pushback is detected
const CIRCUIT_BREAKER_COOLDOWN_MS = 30 * 60 * 1000;
// COM-26 Stage C — tunable: stagger between tracked account sync starts
const INTER_ACCOUNT_START_DELAY_MS = 500;
const INTER_ACCOUNT_START_JITTER_MS = 500;

// Types
interface UserIdResult {
  userId: string;
  isPrivate: boolean;
  followedByViewer: boolean;
  isVerified: boolean;
  followersCount: number;
  followingCount: number;
}

export type SyncStepStatus = 'pending' | 'syncing' | 'complete' | 'error';

export interface AccountSyncStatus {
  userId: string;
  username: string;
  metadata: SyncStepStatus;
  following: SyncStepStatus;
  followers: SyncStepStatus;
  followingDisabled?: boolean;
  followersDisabled?: boolean;
}

export interface SyncOptions {
  skipFollowing?: boolean;
  skipFollowers?: boolean;
}

export interface SyncState {
  isActive: boolean;
  mainAccount: AccountSyncStatus | null;
  trackedAccounts: AccountSyncStatus[];
}

interface FollowResult {
  success: boolean;
  isFollowing?: boolean;
  isOutgoingRequest?: boolean;
  isPrivate?: boolean;
  error?: string;
}

interface FollowUserParams {
  targetUserId: string;
  targetUsername: string;
  targetProfilePicUrl?: string | null;
}

interface InstagramContextType {
  isLoggedIn: boolean | null;
  sessionExpired: boolean;
  userId: string | null;
  isLoadingUserId: boolean;
  syncState: SyncState;
  isCoolingDown: boolean;
  showLogin: () => void;
  reconnect: () => void;
  disconnect: () => void;
  fetchUserId: (username: string) => Promise<UserIdResult>;
  sync: () => void;
  syncTrackedAccount: (userId: string, username: string, options?: SyncOptions) => void;
  followUser: (params: FollowUserParams) => Promise<FollowResult>;
  unfollowUser: (targetUserId: string) => Promise<FollowResult>;
}

interface WebViewMessage {
  type:
    | 'LOGIN_SUCCESS'
    | 'LOGOUT_SUCCESS'
    | 'LOGIN_STATUS_CHECK'
    | 'FOLLOWING_COMPLETE'
    | 'FOLLOWERS_COMPLETE'
    | 'FETCH_ERROR'
    | 'LOGOUT_ERROR'
    | 'USER_ID_FETCHED'
    | 'ACCOUNT_METADATA_FETCHED'
    | 'DEBUG_LOG'
    | 'FOLLOW_USER_RESULT'
    | 'UNFOLLOW_USER_RESULT'
    | 'SYNC_METRICS'
    | 'CIRCUIT_BREAKER_TRIPPED';
  userId?: string;
  username?: string;
  success?: boolean;
  users?: Array<{ id: string; username: string }>;
  isMainUser?: boolean;
  error?: string;
  biography?: string | null;
  profilePicUrl?: string | null;
  mediaCount?: number | null;
  followersCount?: number | null;
  followingCount?: number | null;
  isPrivate?: boolean;
  isVerified?: boolean;
  followedByViewer?: boolean;
  message?: string;
  targetUserId?: string;
  isFollowing?: boolean;
  isOutgoingRequest?: boolean;
  listType?: 'following' | 'followers' | 'metadata';
  pageNum?: number;
  userCount?: number;
  durationMs?: number;
  requestCount?: number;
  pushbackCount?: number;
  errorCount?: number;
  reason?: string;
}

interface User {
  id: string;
  username: string;
  full_name?: string | null;
  profile_pic_url?: string | null;
}

// Helpers
const bucketSize = (n?: number): string => {
  const v = n ?? 0;
  if (v < 1000) return '<1k';
  if (v < 3000) return '1-3k';
  if (v < 10000) return '3-10k';
  if (v < 50000) return '10-50k';
  return '50k+';
};

// Classify a FETCH_ERROR message into a coarse reason for telemetry. The point is
// to make the failures the circuit breaker does NOT trip on measurable — chiefly
// an HTTP 400 with a {"spam":true} body, which Instagram serves to flagged
// accounts and which is otherwise invisible (no metrics, no pushback event).
// Status / coarse category only — no usernames, IDs, or response bodies.
const classifyFetchError = (message?: string): string => {
  const m = (message ?? '').toLowerCase();
  const status = m.match(/\b([1-5]\d{2})\b/)?.[1];
  if (status) return `http_${status}`;
  if (m.includes('network') || m.includes('timeout') || m.includes('abort')) return 'network';
  return 'other';
};

// Context
const InstagramContext = createContext<InstagramContextType | undefined>(undefined);

export const useInstagram = () => {
  const context = useContext(InstagramContext);
  if (!context) {
    throw new Error('useInstagram must be used within InstagramProvider');
  }
  return context;
};

// Provider
export const InstagramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // i18n
  const { t } = useTranslation('instagram');

  // Database
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  // Account context
  const { account, trackedInstagrams } = useAccountContext();
  const connectInstagram = useConnectInstagram();
  const disconnectInstagram = useDisconnectInstagram();

  // State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [[isLoadingUserId, userId], setUserId] = useStorage('instagram_user_id');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>({
    isActive: false,
    mainAccount: null,
    trackedAccounts: [],
  });
  const [apiWebViewReady, setApiWebViewReady] = useState(false);
  // Circuit-breaker cooldown: while in cooldown, syncing is paused to protect the account
  const [isCoolingDown, setIsCoolingDown] = useState(false);

  // Refs
  const loginWebViewRef = useRef<WebView>(null);
  const apiWebViewRef = useRef<WebView>(null);
  const fetchingUsersRef = useRef<Set<string>>(new Set());
  const justLoggedInRef = useRef(false);
  const pendingFetchUserIdRef = useRef<string | null>(null);
  const pendingLoginCheckRef = useRef<string | null>(null);
  const userIdFetchPromisesRef = useRef<
    Map<string, { resolve: (result: UserIdResult) => void; reject: (error: Error) => void }>
  >(new Map());
  const followPromisesRef = useRef<
    Map<
      string,
      {
        resolve: (result: FollowResult) => void;
        reject: (error: Error) => void;
        username: string;
        profilePicUrl?: string | null;
      }
    >
  >(new Map());
  const unfollowPromisesRef = useRef<
    Map<string, { resolve: (result: FollowResult) => void; reject: (error: Error) => void }>
  >(new Map());

  // Watchdog: stall timeout (ms) with no incoming WebView message while isActive=true
  const SYNC_STALL_TIMEOUT_MS = 90000;
  const syncStallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of syncState for read access inside callbacks without closure staleness
  const syncStateRef = useRef<SyncState>(syncState);
  // Guards against late WebView messages arriving after the watchdog has settled a stalled sync
  const stalledRef = useRef(false);
  // Timestamp (ms epoch) until which syncing is blocked after a circuit-breaker trip
  const circuitBreakerCooldownRef = useRef<number>(0);
  // Timer that flips isCoolingDown back to false when the cooldown window elapses
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep syncStateRef current so watchdog callbacks can read the latest state
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  // Watchdog: stop the stall timer
  const clearStallTimer = () => {
    if (syncStallTimerRef.current !== null) {
      clearTimeout(syncStallTimerRef.current);
      syncStallTimerRef.current = null;
    }
  };

  // Watchdog: force-resolve a wedged sync by marking all still-'syncing' steps as 'error'
  const handleSyncStall = () => {
    console.warn(
      '⚠️ Sync watchdog fired: no WebView activity for',
      SYNC_STALL_TIMEOUT_MS,
      'ms. Force-resolving stalled sync.'
    );
    fetchingUsersRef.current.clear();
    stalledRef.current = true;
    setSyncState((prev) => {
      if (!prev.isActive) return prev;

      const settleSteps = (acc: AccountSyncStatus): AccountSyncStatus => ({
        ...acc,
        metadata: acc.metadata === 'syncing' || acc.metadata === 'pending' ? 'error' : acc.metadata,
        following:
          acc.following === 'syncing' || acc.following === 'pending' ? 'error' : acc.following,
        followers:
          acc.followers === 'syncing' || acc.followers === 'pending' ? 'error' : acc.followers,
      });

      return {
        isActive: false,
        mainAccount: prev.mainAccount ? settleSteps(prev.mainAccount) : null,
        trackedAccounts: prev.trackedAccounts.map(settleSteps),
      };
    });
    // Stop the WebView scheduler so stale in-flight fetches don't keep running after
    // the watchdog has settled sync state. This bumps _gen so any pending task
    // completions don't corrupt _inFlight of the next sync's _resetCircuitBreaker.
    apiWebViewRef.current?.injectJavaScript(
      'window.instagramAPI && window.instagramAPI._abortAllRequests && window.instagramAPI._abortAllRequests(); true;'
    );
  };

  // Watchdog: reset the inactivity timer (called on every incoming WebView message)
  const resetStallTimer = () => {
    if (!syncStateRef.current.isActive) return;
    clearStallTimer();
    syncStallTimerRef.current = setTimeout(handleSyncStall, SYNC_STALL_TIMEOUT_MS);
  };

  // Watchdog: clean up timer when isActive goes false or on unmount
  useEffect(() => {
    if (!syncState.isActive) {
      clearStallTimer();
    }
  }, [syncState.isActive]);

  useEffect(() => {
    return () => clearStallTimer();
  }, []);

  // Clean up the cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  // On mount (once the stored userId is available), restore any persisted
  // circuit-breaker cooldown so we keep syncing paused across app restarts.
  useEffect(() => {
    if (isLoadingUserId || !userId) return;

    let cancelled = false;
    const restoreCooldown = async () => {
      try {
        const row = await db.getFirstAsync<{ circuit_breaker_cooldown_until: string | null }>(
          'SELECT circuit_breaker_cooldown_until FROM sync_state WHERE instagram_user_id = ?',
          [userId]
        );
        if (cancelled) return;
        const until = row?.circuit_breaker_cooldown_until
          ? new Date(row.circuit_breaker_cooldown_until).getTime()
          : 0;
        const remaining = until - Date.now();
        if (remaining > 0) {
          circuitBreakerCooldownRef.current = until;
          setIsCoolingDown(true);
          if (cooldownTimerRef.current !== null) {
            clearTimeout(cooldownTimerRef.current);
          }
          cooldownTimerRef.current = setTimeout(() => {
            circuitBreakerCooldownRef.current = 0;
            setIsCoolingDown(false);
            cooldownTimerRef.current = null;
          }, remaining);
        }
      } catch (error) {
        console.error('Failed to read circuit-breaker cooldown:', error);
      }
    };
    restoreCooldown();

    return () => {
      cancelled = true;
    };
  }, [isLoadingUserId, userId]);

  // Clear the cooldown after a fully-successful sync (every step 'complete', zero
  // 'error'). Deliberately does NOT clear on watchdog/circuit-breaker/partial-error
  // settles, which leave at least one step in 'error'.
  useEffect(() => {
    if (syncState.isActive) return;

    const stepsComplete = (acc: AccountSyncStatus) =>
      acc.metadata === 'complete' && acc.following === 'complete' && acc.followers === 'complete';

    // Require a main account that completed; an empty/null state is a
    // logout/reset, not a successful sync.
    if (!syncState.mainAccount || !stepsComplete(syncState.mainAccount)) return;
    if (!syncState.trackedAccounts.every(stepsComplete)) return;

    // Nothing to do if there's no active cooldown (use the ref to avoid stale closure)
    if (circuitBreakerCooldownRef.current === 0) return;

    circuitBreakerCooldownRef.current = 0;
    setIsCoolingDown(false);
    if (cooldownTimerRef.current !== null) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    if (userId) {
      const mainAccountUserId = userId;
      const clearCooldown = async () => {
        try {
          const now = new Date().toISOString();
          await db.runAsync(
            'UPDATE sync_state SET circuit_breaker_cooldown_until = NULL, date_updated = ? WHERE instagram_user_id = ?',
            [now, mainAccountUserId]
          );
        } catch (error) {
          console.error('Failed to clear circuit-breaker cooldown:', error);
        }
      };
      clearCooldown();
    }
  }, [syncState]);

  // Fetch following list for a user (internal helper)
  const fetchFollowing = (userIdToFetch: string) => {
    if (!apiWebViewRef.current) {
      console.warn('⚠️ fetchFollowing: API WebView not ready');
      return;
    }

    if (fetchingUsersRef.current.has(userIdToFetch)) {
      console.log('⏭️ Skipping duplicate fetch for:', userIdToFetch);
      return;
    }

    console.log('🔄 fetchFollowing:', userIdToFetch, '(method:', FOLLOWING_API_METHOD, ')');
    fetchingUsersRef.current.add(userIdToFetch);

    const apiMethod =
      FOLLOWING_API_METHOD === 'graphql' ? 'fetchFollowingGraphQL' : 'fetchFollowing';

    apiWebViewRef.current.injectJavaScript(`(function(){
      console.log('📱 Injecting ${apiMethod} for userId:', '${userIdToFetch}');
      if (window.instagramAPI?.${apiMethod}) {
        window.instagramAPI.${apiMethod}('${userIdToFetch}');
      } else {
        console.error('❌ window.instagramAPI.${apiMethod} not available');
      }
    })(); true;`);
  };

  // Toggle for benchmarking: 'rest' or 'graphql'
  const FOLLOWING_API_METHOD: 'rest' | 'graphql' = 'graphql';
  const FOLLOWERS_API_METHOD: 'rest' | 'graphql' = 'graphql';

  // Fetch followers list for a user (internal helper)
  const fetchFollowers = (userIdToFetch: string) => {
    if (!apiWebViewRef.current) {
      console.warn('⚠️ fetchFollowers: API WebView not ready');
      return;
    }

    if (fetchingUsersRef.current.has(`followers_${userIdToFetch}`)) {
      console.log('⏭️ Skipping duplicate fetch for followers:', userIdToFetch);
      return;
    }

    console.log('🔄 fetchFollowers:', userIdToFetch, '(method:', FOLLOWERS_API_METHOD, ')');
    fetchingUsersRef.current.add(`followers_${userIdToFetch}`);

    const apiMethod =
      FOLLOWERS_API_METHOD === 'graphql' ? 'fetchFollowersGraphQL' : 'fetchFollowers';

    apiWebViewRef.current.injectJavaScript(`(function(){
      console.log('📱 Injecting ${apiMethod} for userId:', '${userIdToFetch}');
      if (window.instagramAPI?.${apiMethod}) {
        window.instagramAPI.${apiMethod}('${userIdToFetch}');
      } else {
        console.error('❌ window.instagramAPI.${apiMethod} not available');
      }
    })(); true;`);
  };

  // Fetch account metadata (internal helper)
  const fetchMetadata = (username: string) => {
    if (!apiWebViewRef.current) {
      console.warn('⚠️ fetchMetadata: API WebView not ready');
      return;
    }

    console.log('🔄 fetchMetadata:', username);

    apiWebViewRef.current.injectJavaScript(`(function(){
      console.log('📱 Injecting fetchAccountMetadata for username:', '${username}');
      if (window.instagramAPI?.fetchAccountMetadata) {
        window.instagramAPI.fetchAccountMetadata('${username}');
      } else {
        console.error('❌ window.instagramAPI.fetchAccountMetadata not available');
      }
    })(); true;`);
  };

  // Check login status when userId and API WebView are ready
  useEffect(() => {
    if (isLoadingUserId) return;

    if (userId && apiWebViewReady) {
      if (!justLoggedInRef.current) {
        checkLoginStatus(userId);
      }
    } else if (!userId && apiWebViewReady) {
      setIsLoggedIn(false);
      clearWebViewSession();
    } else if (!userId) {
      setIsLoggedIn(false);
    } else if (userId && !apiWebViewReady) {
      pendingLoginCheckRef.current = userId;
    }
  }, [isLoadingUserId, userId, apiWebViewReady]);

  // Verify account matches (removed automatic sync - now handled by InitialSync component)
  useEffect(() => {
    if (!isLoggedIn || !apiWebViewReady || !userId || !account) return;

    // Check if logged-in Instagram account matches the backend account
    if (account.instagram_user_id && account.instagram_user_id !== userId) {
      console.error('Account mismatch: clearing data and logging out');

      // Clear database and logout
      const handleMismatch = async () => {
        await clearAllData(db);
        handleDisconnect();
      };
      handleMismatch();
      return;
    }

    // Reset fresh login flag (sync is now handled by InitialSync component)
    if (justLoggedInRef.current) {
      justLoggedInRef.current = false;
    }
  }, [isLoggedIn, apiWebViewReady, userId, account]);

  // Inject JavaScript helper (uses API WebView)
  const injectJS = (code: string) => {
    apiWebViewRef.current?.injectJavaScript(`(function(){${code}})(); true;`);
  };

  // Clear WebView session
  const clearWebViewSession = () => {
    if (!apiWebViewRef.current) return;

    injectJS(`
      if (window.instagramAPI?.clearSession) {
        window.instagramAPI.clearSession();
      }
    `);

    apiWebViewRef.current.clearCache?.(true);
  };

  // Check if user is still logged in
  const checkLoginStatus = (userIdToCheck: string) => {
    if (!apiWebViewRef.current) return;

    injectJS(`
      if (window.instagramAPI?.checkLoginStatus) {
        window.instagramAPI.checkLoginStatus('${userIdToCheck}');
      }
    `);
  };

  // A step is "settled" when it has reached a terminal state (complete or error).
  // 'syncing' and 'pending' are non-terminal and keep isActive=true.
  const isSettled = (s: SyncStepStatus) => s === 'complete' || s === 'error';

  // Helper to update a specific account's sync status
  const updateAccountSyncStatus = (
    targetUserId: string,
    field: 'metadata' | 'following' | 'followers',
    status: SyncStepStatus
  ) => {
    setSyncState((prev) => {
      // Check if it's the main account
      if (prev.mainAccount?.userId === targetUserId) {
        const updatedMain = { ...prev.mainAccount, [field]: status };
        const allSettled =
          isSettled(updatedMain.metadata) &&
          isSettled(updatedMain.following) &&
          isSettled(updatedMain.followers);
        const allTrackedSettled = prev.trackedAccounts.every(
          (acc) => isSettled(acc.metadata) && isSettled(acc.following) && isSettled(acc.followers)
        );
        return {
          ...prev,
          mainAccount: updatedMain,
          isActive: !(allSettled && allTrackedSettled),
        };
      }

      // Check tracked accounts
      const trackedIndex = prev.trackedAccounts.findIndex((acc) => acc.userId === targetUserId);
      if (trackedIndex !== -1) {
        const updatedTracked = [...prev.trackedAccounts];
        updatedTracked[trackedIndex] = { ...updatedTracked[trackedIndex], [field]: status };
        // If mainAccount is null, consider it settled (not syncing)
        const mainSettled =
          !prev.mainAccount ||
          (isSettled(prev.mainAccount.metadata) &&
            isSettled(prev.mainAccount.following) &&
            isSettled(prev.mainAccount.followers));
        const allTrackedSettled = updatedTracked.every(
          (acc) => isSettled(acc.metadata) && isSettled(acc.following) && isSettled(acc.followers)
        );
        return {
          ...prev,
          trackedAccounts: updatedTracked,
          isActive: !(mainSettled && allTrackedSettled),
        };
      }

      return prev;
    });
  };

  // Sync all accounts (main user + tracked accounts)
  // TODO: Remove this fake delay - for testing sync UI only
  const FAKE_SYNC_DELAY_MS = 0;

  const sync = async () => {
    // Skip if already syncing
    if (syncState.isActive) {
      console.log('⏭️ Sync already in progress, skipping');
      return;
    }

    // Skip if a circuit-breaker cooldown is still active
    if (Date.now() < circuitBreakerCooldownRef.current) {
      console.log('⏭️ Sync blocked: circuit-breaker cooldown active');
      return;
    }

    if (!isLoggedIn || !userId) {
      console.warn('⚠️ Cannot sync: not logged in', { isLoggedIn, userId });
      return;
    }

    if (!account?.instagram_username) {
      console.warn('⚠️ Cannot sync: no instagram username');
      return;
    }

    console.log(
      '🔄 Starting sync - userId:',
      userId,
      'tracked accounts:',
      trackedInstagrams.length
    );

    // Read sync preferences for main account
    const mainSyncPrefs = await db.getFirstAsync<{
      followers_sync_disabled: number;
      following_sync_disabled: number;
    }>(
      'SELECT followers_sync_disabled, following_sync_disabled FROM sync_state WHERE instagram_user_id = ?',
      [userId]
    );
    const mainSkipFollowing = mainSyncPrefs?.following_sync_disabled === 1;
    const mainSkipFollowers = mainSyncPrefs?.followers_sync_disabled === 1;

    // Read sync preferences for all tracked accounts
    const trackedPrefs = new Map<string, { skipFollowing: boolean; skipFollowers: boolean }>();
    for (const tracked of trackedInstagrams) {
      const prefs = await db.getFirstAsync<{
        followers_sync_disabled: number;
        following_sync_disabled: number;
      }>(
        'SELECT followers_sync_disabled, following_sync_disabled FROM sync_state WHERE instagram_user_id = ?',
        [tracked.user_id]
      );
      trackedPrefs.set(tracked.user_id, {
        skipFollowing: prefs?.following_sync_disabled === 1,
        skipFollowers: prefs?.followers_sync_disabled === 1,
      });
    }

    // Initialize sync state with all accounts
    const mainAccountStatus: AccountSyncStatus = {
      userId,
      username: account.instagram_username,
      metadata: 'syncing',
      following: mainSkipFollowing ? 'complete' : 'syncing',
      followers: mainSkipFollowers ? 'complete' : 'syncing',
      followingDisabled: mainSkipFollowing,
      followersDisabled: mainSkipFollowers,
    };

    const trackedAccountStatuses: AccountSyncStatus[] = trackedInstagrams.map((tracked) => {
      const prefs = trackedPrefs.get(tracked.user_id);
      return {
        userId: tracked.user_id,
        username: tracked.username,
        metadata: 'syncing',
        following: prefs?.skipFollowing ? 'complete' : 'syncing',
        followers: prefs?.skipFollowers ? 'complete' : 'syncing',
        followingDisabled: prefs?.skipFollowing,
        followersDisabled: prefs?.skipFollowers,
      };
    });

    stalledRef.current = false;
    setSyncState({
      isActive: true,
      mainAccount: mainAccountStatus,
      trackedAccounts: trackedAccountStatuses,
    });

    // TODO: Remove this fake delay - for testing sync UI only
    if (FAKE_SYNC_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, FAKE_SYNC_DELAY_MS));
    }

    // Reset circuit-breaker + instrumentation before kicking off fetches
    apiWebViewRef.current?.injectJavaScript(
      'window.instagramAPI._resetCircuitBreaker(); window.instagramAPI.resetSyncMetrics(); true;'
    );

    // Start all fetches in parallel for main account
    fetchMetadata(account.instagram_username);
    if (!mainSkipFollowing) fetchFollowing(userId);
    if (!mainSkipFollowers) fetchFollowers(userId);

    // Start fetches for tracked accounts with staggered delays.
    // Each account is staggered by 1500–2500 ms; even with 5 tracked accounts
    // (~10 s total stagger) this stays well under the 90 s watchdog timeout.
    for (let i = 0; i < trackedInstagrams.length; i++) {
      // Always delay tracked accounts (main account already started above).
      // The global scheduler (cap=2) serialises concurrent fetches further.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          INTER_ACCOUNT_START_DELAY_MS + Math.random() * INTER_ACCOUNT_START_JITTER_MS
        )
      );
      const tracked = trackedInstagrams[i];
      const prefs = trackedPrefs.get(tracked.user_id);
      fetchMetadata(tracked.username);
      if (!prefs?.skipFollowing) fetchFollowing(tracked.user_id);
      if (!prefs?.skipFollowers) fetchFollowers(tracked.user_id);
    }
  };

  // Sync a single tracked account (used when adding a new tracked account)
  const syncTrackedAccount = (
    trackedUserId: string,
    trackedUsername: string,
    options?: SyncOptions
  ) => {
    if (!isLoggedIn || !userId) {
      console.warn('⚠️ Cannot sync tracked account: not logged in');
      return;
    }

    // Skip if a circuit-breaker cooldown is still active
    if (Date.now() < circuitBreakerCooldownRef.current) {
      console.log('⏭️ Sync blocked: circuit-breaker cooldown active');
      return;
    }

    const { skipFollowing = false, skipFollowers = false } = options || {};

    console.log('🔄 Starting sync for tracked account:', trackedUsername, {
      skipFollowing,
      skipFollowers,
    });

    // Create sync status for the new tracked account
    const newTrackedStatus: AccountSyncStatus = {
      userId: trackedUserId,
      username: trackedUsername,
      metadata: 'syncing',
      following: skipFollowing ? 'complete' : 'syncing',
      followers: skipFollowers ? 'complete' : 'syncing',
      followingDisabled: skipFollowing,
      followersDisabled: skipFollowers,
    };

    stalledRef.current = false;
    // Add to sync state (or update if already exists)
    setSyncState((prev) => {
      const existingIndex = prev.trackedAccounts.findIndex((acc) => acc.userId === trackedUserId);
      const updatedTrackedAccounts =
        existingIndex !== -1
          ? prev.trackedAccounts.map((acc, i) => (i === existingIndex ? newTrackedStatus : acc))
          : [...prev.trackedAccounts, newTrackedStatus];

      return {
        ...prev,
        isActive: true,
        trackedAccounts: updatedTrackedAccounts,
      };
    });

    // Only reset circuit-breaker + instrumentation when no full sync is already
    // running. Injecting resets mid-sync would zero the main account's in-progress
    // metrics and could clear a breaker that just tripped.
    if (!syncState.isActive) {
      apiWebViewRef.current?.injectJavaScript(
        'window.instagramAPI._resetCircuitBreaker(); window.instagramAPI.resetSyncMetrics(); true;'
      );
    }

    // Start fetches for this tracked account (skip disabled ones)
    fetchMetadata(trackedUsername);
    if (!skipFollowing) fetchFollowing(trackedUserId);
    if (!skipFollowers) fetchFollowers(trackedUserId);
  };

  // Disconnect (logout)
  const handleDisconnect = () => {
    if (!apiWebViewRef.current || !userId) return;

    injectJS(`
      if (window.instagramAPI?.logout) {
        window.instagramAPI.logout('${userId}');
      }
    `);
  };

  // Fetch user ID by username
  const fetchUserId = (username: string): Promise<UserIdResult> => {
    return new Promise((resolve, reject) => {
      if (!apiWebViewRef.current) {
        reject(new Error('API WebView not ready'));
        return;
      }

      userIdFetchPromisesRef.current.set(username, { resolve, reject });

      injectJS(`
        if (window.instagramAPI?.fetchUserId) {
          window.instagramAPI.fetchUserId('${username}');
        }
      `);
    });
  };

  // Follow a user
  const followUser = ({
    targetUserId,
    targetUsername,
    targetProfilePicUrl,
  }: FollowUserParams): Promise<FollowResult> => {
    return new Promise((resolve, reject) => {
      if (!apiWebViewRef.current) {
        reject(new Error('API WebView not ready'));
        return;
      }

      followPromisesRef.current.set(targetUserId, {
        resolve,
        reject,
        username: targetUsername,
        profilePicUrl: targetProfilePicUrl,
      });

      injectJS(`
        if (window.instagramAPI?.followUser) {
          window.instagramAPI.followUser('${targetUserId}');
        }
      `);
    });
  };

  // Unfollow a user
  const unfollowUser = (targetUserId: string): Promise<FollowResult> => {
    return new Promise((resolve, reject) => {
      if (!apiWebViewRef.current) {
        reject(new Error('API WebView not ready'));
        return;
      }

      unfollowPromisesRef.current.set(targetUserId, { resolve, reject });

      injectJS(`
        if (window.instagramAPI?.unfollowUser) {
          window.instagramAPI.unfollowUser('${targetUserId}');
        }
      `);
    });
  };

  // Handle following list completion
  const handleFollowingComplete = async (userId: string, users: User[]) => {
    // Deduplicate users
    const deduplicatedUsers = Array.from(new Map(users.map((user) => [user.id, user])).values());

    try {
      // Sync to SQLite
      await syncFollowingList(db, userId, deduplicatedUsers);

      // Invalidate activity cache to reflect updated data
      queryClient.invalidateQueries({ queryKey: ['instagramActivity', userId] });
      queryClient.invalidateQueries({ queryKey: ['followerStats', userId] });
    } catch (error) {
      console.error(`Error syncing following list for ${userId}:`, error);
    }
  };

  // Handle followers list completion
  const handleFollowersComplete = async (userId: string, users: User[]) => {
    // Deduplicate users
    const deduplicatedUsers = Array.from(new Map(users.map((user) => [user.id, user])).values());

    try {
      // Sync to SQLite
      await syncFollowersList(db, userId, deduplicatedUsers);

      // Invalidate activity cache to reflect updated data
      queryClient.invalidateQueries({ queryKey: ['instagramActivity', userId] });
      queryClient.invalidateQueries({ queryKey: ['followerStats', userId] });
    } catch (error) {
      console.error(`Error syncing followers list for ${userId}:`, error);
    }
  };

  // Close login modal and stop polling
  const closeLoginModal = () => {
    if (loginWebViewRef.current) {
      loginWebViewRef.current.injectJavaScript(`(function(){
        if (window.instagramAPI?.stopLoginPolling) {
          window.instagramAPI.stopLoginPolling();
        }
      })(); true;`);
    }
    setShowLoginModal(false);
  };

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data: WebViewMessage = JSON.parse(event.nativeEvent.data);

      // Watchdog: every arriving message resets the stall timer
      resetStallTimer();

      switch (data.type) {
        case 'LOGIN_SUCCESS':
          closeLoginModal();
          justLoggedInRef.current = true;

          // Check if this is a different account than before
          const previousUserId = account?.instagram_user_id;
          const newUserId = data.userId!;
          const isDifferentAccount = previousUserId && previousUserId !== newUserId;

          if (isDifferentAccount) {
            console.log('🔄 Different account detected, clearing all data');
            // Clear all local data for the old account
            const clearAndSetup = async () => {
              // Clear any in-progress sync to prevent the watchdog from settling
              // the new account's freshly-started steps after an account switch.
              clearStallTimer();
              setSyncState({ isActive: false, mainAccount: null, trackedAccounts: [] });
              fetchingUsersRef.current.clear();
              await clearAllData(db);
              // Disconnect old account from backend
              if (account?.uuid) {
                disconnectInstagram.mutate({ uuid: account.uuid });
              }
              // Now set up the new account
              setUserId(newUserId);
              setIsLoggedIn(true);
              setSessionExpired(false);
              analytics.track(Events.INSTAGRAM_CONNECTED);
              // Connect new Instagram account
              if (account?.uuid && data.username) {
                connectInstagram.mutate({
                  uuid: account.uuid,
                  userId: newUserId,
                  username: data.username,
                });
              }
            };
            clearAndSetup();
          } else {
            // Same account or first login
            setUserId(newUserId);
            setIsLoggedIn(true);
            setSessionExpired(false);
            analytics.track(Events.INSTAGRAM_CONNECTED);

            // Connect Instagram account
            if (account?.uuid && data.userId && data.username) {
              connectInstagram.mutate({
                uuid: account.uuid,
                userId: data.userId,
                username: data.username,
              });
            }
          }
          break;

        case 'LOGOUT_SUCCESS':
          setUserId(null);
          setIsLoggedIn(false);
          setSyncState({ isActive: false, mainAccount: null, trackedAccounts: [] });
          fetchingUsersRef.current.clear();

          // Clear all local data
          const clearAllLocalData = async () => {
            try {
              // Clear database
              await clearAllData(db);

              // Clear WebView cache and session
              apiWebViewRef.current?.clearCache?.(true);
              clearWebViewSession();

              // Disconnect Instagram account from backend
              if (account?.uuid) {
                disconnectInstagram.mutate({
                  uuid: account.uuid,
                });
              }

              console.log('Successfully cleared all local data');
            } catch (error) {
              console.error('Error clearing data on logout:', error);
            }
          };
          clearAllLocalData();
          break;

        case 'LOGIN_STATUS_CHECK':
          if (data.success) {
            setIsLoggedIn(true);
            setSessionExpired(false);
          } else {
            // Session was valid before (we had userId) but is now invalid
            setSessionExpired(true);
            setIsLoggedIn(false);
          }
          break;

        case 'FOLLOWING_COMPLETE':
          if (stalledRef.current) break;
          fetchingUsersRef.current.delete(data.userId!);
          handleFollowingComplete(data.userId!, data.users!);
          updateAccountSyncStatus(data.userId!, 'following', 'complete');
          break;

        case 'FOLLOWERS_COMPLETE':
          if (stalledRef.current) break;
          fetchingUsersRef.current.delete(`followers_${data.userId!}`);
          handleFollowersComplete(data.userId!, data.users!);
          updateAccountSyncStatus(data.userId!, 'followers', 'complete');
          break;

        case 'SYNC_METRICS':
          if (stalledRef.current) break;
          console.log('[SyncMetrics]', JSON.stringify(data));
          analytics.track(Events.SYNC_METRICS_REPORTED, {
            listType: data.listType,
            sizeBucket: bucketSize(data.userCount),
            pages: data.pageNum,
            requests: data.requestCount,
            durationMs: data.durationMs,
            pushbackCount: data.pushbackCount,
            errorCount: data.errorCount,
          });
          break;

        case 'CIRCUIT_BREAKER_TRIPPED':
          if (stalledRef.current) break;
          console.warn('⚠️ Circuit breaker tripped:', data.reason);
          analytics.track(Events.SYNC_PUSHBACK_DETECTED, { reason: data.reason });

          // Force-settle the sync the same way the stall watchdog does:
          // mark every still-syncing/pending step as 'error' and stop the sync.
          fetchingUsersRef.current.clear();
          stalledRef.current = true;
          clearStallTimer();
          setSyncState((prev) => {
            if (!prev.isActive) return prev;

            const settleSteps = (acc: AccountSyncStatus): AccountSyncStatus => ({
              ...acc,
              metadata:
                acc.metadata === 'syncing' || acc.metadata === 'pending' ? 'error' : acc.metadata,
              following:
                acc.following === 'syncing' || acc.following === 'pending'
                  ? 'error'
                  : acc.following,
              followers:
                acc.followers === 'syncing' || acc.followers === 'pending'
                  ? 'error'
                  : acc.followers,
            });

            return {
              isActive: false,
              mainAccount: prev.mainAccount ? settleSteps(prev.mainAccount) : null,
              trackedAccounts: prev.trackedAccounts.map(settleSteps),
            };
          });

          // Start the cooldown window and persist it for the main account
          {
            const until = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
            circuitBreakerCooldownRef.current = until;
            setIsCoolingDown(true);
            if (cooldownTimerRef.current !== null) {
              clearTimeout(cooldownTimerRef.current);
            }
            cooldownTimerRef.current = setTimeout(() => {
              circuitBreakerCooldownRef.current = 0;
              setIsCoolingDown(false);
              cooldownTimerRef.current = null;
            }, CIRCUIT_BREAKER_COOLDOWN_MS);

            if (userId) {
              const cooldownIso = new Date(until).toISOString();
              const mainAccountUserId = userId;
              const persistCooldown = async () => {
                try {
                  const now = new Date().toISOString();
                  await db.runAsync(
                    `INSERT INTO sync_state (instagram_user_id, circuit_breaker_cooldown_until, date_created, date_updated)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(instagram_user_id) DO UPDATE SET
                       circuit_breaker_cooldown_until = ?,
                       date_updated = ?`,
                    [mainAccountUserId, cooldownIso, now, now, cooldownIso, now]
                  );
                } catch (error) {
                  console.error('Failed to persist circuit-breaker cooldown:', error);
                }
              };
              persistCooldown();
            }
          }

          Alert.alert(t('cooldown.title'), t('cooldown.message'));
          break;

        case 'FETCH_ERROR':
          if (stalledRef.current) break;
          // Telemetry: surface every fetch failure — including the HTTP 400
          // {"spam":true} pushback that does NOT trip the circuit breaker — so the
          // flagged-account failure rate becomes measurable. listType + coarse
          // reason only, no PII.
          analytics.track(Events.SYNC_FETCH_ERROR, {
            listType: data.listType ?? 'unknown',
            reason: classifyFetchError(data.error),
          });
          if (data.listType === 'metadata') {
            // Metadata failure: resolve username→userId using the ref (no state-setter hack needed)
            const metaUsername = data.username;
            if (metaUsername) {
              const snap = syncStateRef.current;
              let targetId: string | undefined;
              const metaUsernameLower = metaUsername.toLowerCase();
              // Note: if a tracked account has the same username as the main account, the
              // main account match takes priority — this edge case is intentionally left as-is.
              if (snap.mainAccount?.username.toLowerCase() === metaUsernameLower) {
                targetId = snap.mainAccount.userId;
              } else {
                targetId = snap.trackedAccounts.find(
                  (acc) => acc.username.toLowerCase() === metaUsernameLower
                )?.userId;
              }
              if (targetId) {
                updateAccountSyncStatus(targetId, 'metadata', 'error');
              }
            }
            console.log('❌ Metadata fetch error for', metaUsername, ':', data.error);
          } else if (data.userId) {
            const lt = data.listType; // 'following' | 'followers' | undefined
            if (lt === 'following') {
              fetchingUsersRef.current.delete(data.userId);
              updateAccountSyncStatus(data.userId, 'following', 'error');
            } else if (lt === 'followers') {
              fetchingUsersRef.current.delete(`followers_${data.userId}`);
              updateAccountSyncStatus(data.userId, 'followers', 'error');
            } else {
              // listType absent (safety fallback) - mark both as before
              fetchingUsersRef.current.delete(data.userId);
              fetchingUsersRef.current.delete(`followers_${data.userId}`);
              updateAccountSyncStatus(data.userId, 'following', 'error');
              updateAccountSyncStatus(data.userId, 'followers', 'error');
            }
            console.log('❌ Error:', data.error);
          }
          break;

        case 'LOGOUT_ERROR':
          console.error('Logout error:', data.error);
          break;

        case 'USER_ID_FETCHED':
          if (data.username && data.userId) {
            const promise = userIdFetchPromisesRef.current.get(data.username);
            if (promise) {
              promise.resolve({
                userId: data.userId,
                isPrivate: data.isPrivate || false,
                followedByViewer: data.followedByViewer || false,
                isVerified: data.isVerified || false,
                followersCount: data.followersCount || 0,
                followingCount: data.followingCount || 0,
              });
              userIdFetchPromisesRef.current.delete(data.username);
            }
          } else if (data.username && data.error) {
            const promise = userIdFetchPromisesRef.current.get(data.username);
            if (promise) {
              promise.reject(new Error(data.error));
              userIdFetchPromisesRef.current.delete(data.username);
            }
          }
          break;

        case 'ACCOUNT_METADATA_FETCHED':
          if (stalledRef.current) break;
          if (data.userId && data.username) {
            const updateMetadata = async () => {
              try {
                const now = new Date().toISOString();
                await db.runAsync(
                  `INSERT INTO instagrams (user_id, username, biography, profile_pic_url, media_count, followers_count, following_count, date_created, date_updated)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     biography = ?,
                     profile_pic_url = ?,
                     media_count = ?,
                     followers_count = ?,
                     following_count = ?,
                     date_updated = ?`,
                  [
                    data.userId,
                    data.username,
                    data.biography,
                    data.profilePicUrl,
                    data.mediaCount,
                    data.followersCount,
                    data.followingCount,
                    now,
                    now,
                    data.biography,
                    data.profilePicUrl,
                    data.mediaCount,
                    data.followersCount,
                    data.followingCount,
                    now,
                  ]
                );
                console.log(`✅ Updated metadata for ${data.username}`);

                // Invalidate caches so UI gets updated profile pic
                queryClient.invalidateQueries({ queryKey: ['instagram', data.userId] });
                queryClient.invalidateQueries({ queryKey: ['trackedInstagrams'] });

                // Update sync state
                updateAccountSyncStatus(data.userId!, 'metadata', 'complete');
              } catch (error) {
                console.error('Error updating account metadata:', error);
                updateAccountSyncStatus(data.userId!, 'metadata', 'error');
              }
            };
            updateMetadata();
          }
          break;

        case 'DEBUG_LOG':
          console.log('[WebView]', data.message);
          break;

        case 'FOLLOW_USER_RESULT':
          if (data.targetUserId) {
            const promiseData = followPromisesRef.current.get(data.targetUserId);
            if (promiseData) {
              if (data.success && data.isFollowing && userId) {
                // Update local database - only if actually following (not just a request to private account)
                const updateDb = async () => {
                  try {
                    await addFollowing(
                      db,
                      userId,
                      data.targetUserId!,
                      promiseData.username,
                      promiseData.profilePicUrl
                    );
                    // Invalidate relevant queries
                    queryClient.invalidateQueries({ queryKey: ['followerStats', userId] });
                    queryClient.invalidateQueries({ queryKey: ['accountList', userId] });
                  } catch (error) {
                    console.error('Failed to update database after follow:', error);
                  }
                };
                updateDb();
              }
              promiseData.resolve({
                success: data.success || false,
                isFollowing: data.isFollowing,
                isOutgoingRequest: data.isOutgoingRequest,
                isPrivate: data.isPrivate,
              });
              followPromisesRef.current.delete(data.targetUserId);
            }
          }
          break;

        case 'UNFOLLOW_USER_RESULT':
          if (data.targetUserId) {
            const promise = unfollowPromisesRef.current.get(data.targetUserId);
            if (promise) {
              if (data.success && userId) {
                // Update local database
                const updateDb = async () => {
                  try {
                    await removeFollowing(db, userId, data.targetUserId!);
                    // Invalidate relevant queries
                    queryClient.invalidateQueries({ queryKey: ['followerStats', userId] });
                    queryClient.invalidateQueries({ queryKey: ['accountList', userId] });
                  } catch (error) {
                    console.error('Failed to update database after unfollow:', error);
                  }
                };
                updateDb();
              }
              promise.resolve({
                success: data.success || false,
                isFollowing: data.isFollowing,
              });
              unfollowPromisesRef.current.delete(data.targetUserId);
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };

  // Handle login WebView load
  const handleLoginWebViewLoad = () => {
    console.log('📲 Login WebView loaded');
    if (loginWebViewRef.current) {
      loginWebViewRef.current.injectJavaScript(`(function(){
        if (window.instagramAPI?.startLoginPolling) {
          window.instagramAPI.startLoginPolling();
        }
      })(); true;`);
    }
  };

  // Handle API WebView load
  const handleApiWebViewLoad = () => {
    console.log('📲 API WebView loaded');
    setApiWebViewReady(true);

    // Execute pending login check
    if (pendingLoginCheckRef.current) {
      const userIdToCheck = pendingLoginCheckRef.current;
      pendingLoginCheckRef.current = null;
      setTimeout(() => checkLoginStatus(userIdToCheck), LOGIN_CHECK_DELAY_MS);
    }

    // Execute pending following fetch
    if (pendingFetchUserIdRef.current) {
      const userIdToFetch = pendingFetchUserIdRef.current;
      pendingFetchUserIdRef.current = null;
      setTimeout(() => {
        fetchFollowing(userIdToFetch);
        justLoggedInRef.current = false;
      }, FETCH_FOLLOWING_DELAY_MS);
    }
  };

  // Show login modal
  const showLogin = () => setShowLoginModal(true);

  // Reconnect - used when session has expired
  const reconnect = () => {
    setSessionExpired(false);
    setShowLoginModal(true);
  };

  // Context value
  const value: InstagramContextType = {
    isLoggedIn,
    sessionExpired,
    userId,
    isLoadingUserId,
    syncState,
    isCoolingDown,
    showLogin,
    reconnect,
    disconnect: handleDisconnect,
    fetchUserId,
    sync,
    syncTrackedAccount,
    followUser,
    unfollowUser,
  };

  return (
    <InstagramContext.Provider value={value}>
      {children}

      {/* Login WebView - only shown in modal for login */}
      {showLoginModal && (
        <Modal visible={showLoginModal} animationType="slide" presentationStyle="pageSheet">
          <View className="flex-1 bg-white">
            <View className="flex-row items-center justify-between border-b border-gray-200 p-4">
              <Text className="text-lg font-semibold">{t('login.title')}</Text>
              <Pressable className="px-4 py-2 active:opacity-70" onPress={closeLoginModal}>
                <Text className="text-base font-medium text-blue-500">{t('login.cancel')}</Text>
              </Pressable>
            </View>
            <WebView
              ref={loginWebViewRef}
              source={{ uri: 'https://www.instagram.com/accounts/login/' }}
              className="flex-1"
              onMessage={handleMessage}
              onLoad={handleLoginWebViewLoad}
              injectedJavaScriptBeforeContentLoaded={instagramAPI}
              sharedCookiesEnabled={true}
            />
          </View>
        </Modal>
      )}

      {/* API WebView - always mounted but hidden, used for all API calls */}
      <View style={{ height: 0, width: 0, opacity: 0 }}>
        <WebView
          ref={apiWebViewRef}
          source={{ uri: 'https://www.instagram.com/' }}
          onMessage={handleMessage}
          onLoad={handleApiWebViewLoad}
          injectedJavaScriptBeforeContentLoaded={instagramAPI}
          sharedCookiesEnabled={true}
        />
      </View>
    </InstagramContext.Provider>
  );
};

// Injected JavaScript API
const instagramAPI = `
(function() {
  let loginDetected = false;
  let cookieCheckInterval = null;

  // Sync instrumentation metrics (reset at the start of each sync run)
  var _syncMetrics = { requestCount: 0, pushbackCount: 0, errorCount: 0, startedAt: 0 };

  // ── COM-26 Stage C: Pacing config ─────────────────────────────────────────
  // All values are tunable; change here and a fresh sync picks them up.
  var PACING_CONFIG = {
    MAX_CONCURRENT_REQUESTS: 2,          // COM-26 Stage C — tunable
    MIN_GAP_BETWEEN_REQUESTS_MS: 200,    // COM-26 Stage C — tunable (regular-tuned)
    REQUEST_JITTER_MS: 200,              // COM-26 Stage C — tunable (regular-tuned)
    INTER_PAGE_DELAY_MIN_MS: 300,        // COM-26 Stage C — tunable (regular-tuned)
    INTER_PAGE_DELAY_JITTER_MS: 300      // COM-26 Stage C — tunable (regular-tuned)
  };

  // ── COM-26 Stage C: Global request scheduler ───────────────────────────────
  // Enforces MAX_CONCURRENT_REQUESTS cap + MIN_GAP_BETWEEN_REQUESTS_MS pacing.
  var _queue = [];
  var _inFlight = 0;
  var _lastDispatchAt = 0;
  var _timerArmed = false;
  var _heartbeatTimer = null;
  // Generation counter: bumped by _resetScheduler so stale in-flight completions
  // (from a previous sync) never touch _inFlight of the new sync.
  var _gen = 0;

  // Watchdog heartbeat: emits DEBUG_LOG every ~25 s while work is pending so
  // the RN stall-watchdog (90 s) keeps getting messages during slow paged syncs.
  function _startHeartbeat() {
    if (_heartbeatTimer !== null) return;
    _heartbeatTimer = setInterval(function () {
      if (_inFlight > 0 || _queue.length > 0) {
        sendMessage('DEBUG_LOG', { message: '[Scheduler] heartbeat inFlight=' + _inFlight + ' queued=' + _queue.length });
      } else {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
      }
    }, 25000);
  }

  // Abort every tracked in-flight controller and clear the list.
  function _abortInFlight() {
    for (var i = 0; i < _inFlightControllers.length; i++) {
      try { _inFlightControllers[i].abort(); } catch (e) {}
    }
    _inFlightControllers = [];
  }

  // Central scheduler reset: bump generation (stale closures won't touch _inFlight),
  // abort in-flight fetches, drain the queue, and zero all scheduling state.
  function _resetScheduler() {
    _gen++;
    _abortInFlight();
    while (_queue.length > 0) {
      var c = _queue.shift();
      try { c.reject(new Error('scheduler_reset')); } catch (e) {}
    }
    _inFlight = 0;
    _lastDispatchAt = 0;
    _timerArmed = false;
    if (_heartbeatTimer !== null) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }

  // Single reentrant pump — enforces cap AND min-gap, arms exactly one re-check
  // timer when the gap constraint prevents an immediate dispatch.
  function _schedulerPump() {
    if (_circuitBroken) {
      // Reject-drain: clear queued tasks immediately so callers don't wait forever.
      while (_queue.length > 0) {
        var c = _queue.shift();
        c.reject(new Error('circuit_breaker:' + _circuitBreakerReason));
      }
      return;
    }
    while (_queue.length > 0 && _inFlight < PACING_CONFIG.MAX_CONCURRENT_REQUESTS) {
      var gap = PACING_CONFIG.MIN_GAP_BETWEEN_REQUESTS_MS + Math.floor(Math.random() * PACING_CONFIG.REQUEST_JITTER_MS);
      var wait = (_lastDispatchAt + gap) - Date.now();
      if (wait > 0) {
        // Arm exactly one retry timer; subsequent enqueues will also call pump but
        // the guard keeps only one timer alive at a time.
        if (!_timerArmed) {
          _timerArmed = true;
          setTimeout(function () { _timerArmed = false; _schedulerPump(); }, wait);
        }
        return; // do not dispatch yet — timer will re-enter pump
      }
      var task = _queue.shift();
      var taskGen = _gen;    // capture generation at dispatch time
      _inFlight++;           // increment BEFORE any async work (must be synchronous)
      _lastDispatchAt = Date.now();
      task.run().then(
        function (v) {
          if (taskGen === _gen) { _inFlight = Math.max(0, _inFlight - 1); }
          task.resolve(v);
          // Fix 4: stop the heartbeat promptly once all work is done
          if (_queue.length === 0 && _inFlight === 0 && _heartbeatTimer !== null) {
            clearInterval(_heartbeatTimer);
            _heartbeatTimer = null;
          }
          _schedulerPump();
        },
        function (e) {
          if (taskGen === _gen) { _inFlight = Math.max(0, _inFlight - 1); }
          task.reject(e);
          // Fix 4: stop the heartbeat promptly once all work is done
          if (_queue.length === 0 && _inFlight === 0 && _heartbeatTimer !== null) {
            clearInterval(_heartbeatTimer);
            _heartbeatTimer = null;
          }
          _schedulerPump();
        }
      );
    }
  }

  // Enqueue a fetch thunk; returns a Promise that resolves/rejects with the
  // result of runFn() once the scheduler allows it to proceed.
  function _schedule(runFn) {
    return new Promise(function (resolve, reject) {
      _queue.push({ run: runFn, resolve: resolve, reject: reject });
      _startHeartbeat();
      _schedulerPump();
    });
  }

  // Circuit-breaker state: when tripped, all in-flight requests are aborted
  // and all paginators bail out so we stop hammering Instagram.
  var _circuitBroken = false;
  var _circuitBreakerReason = null;
  var _inFlightControllers = [];

  // Helper: detect pushback signals in a parsed JSON response body
  function _checkPushbackBody(data) {
    return !!(data && (
      data.message === 'checkpoint_required' ||
      data.message === 'require_login' ||
      data.spam === true ||
      data.checkpoint_url ||
      (data.status === 'fail' && typeof data.message === 'string' && (data.message.indexOf('spam') !== -1 || data.message.indexOf('suspicious') !== -1))
    ));
  }

  // Helper: Get cookie value by name
  function getCookie(name) {
    const value = '; ' + document.cookie;
    const parts = value.split('; ' + name + '=');
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
  }

  // Helper: Send message to React Native
  function sendMessage(type, data) {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...data }));
  }

  // Helper: Send debug log to React Native
  function debugLog(...args) {
    sendMessage('DEBUG_LOG', { message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
  }

  // Helper: Post sync metrics to React Native (per completed list)
  function _postSyncMetrics(userId, listType, pageNum, userCount, durationMs) {
    sendMessage('SYNC_METRICS', {
      userId: userId,
      listType: listType,
      pageNum: pageNum,
      userCount: userCount,
      durationMs: durationMs,
      requestCount: _syncMetrics.requestCount,
      pushbackCount: _syncMetrics.pushbackCount,
      errorCount: _syncMetrics.errorCount
    });
  }

  // Helper: Trip the circuit breaker — abort all in-flight requests and signal RN.
  // Idempotent: only the first trip fires the message and aborts.
  function _triggerCircuitBreaker(reason) {
    if (_circuitBroken) return;
    _circuitBroken = true;
    _circuitBreakerReason = reason;
    _syncMetrics.pushbackCount++;
    _abortInFlight();
    // Reject-drain any queued tasks so callers unblock immediately.
    _schedulerPump();
    sendMessage('CIRCUIT_BREAKER_TRIPPED', { reason: reason });
  }

  // Helper: Fetch a single page with per-page retry (exponential backoff).
  // Retries ONLY on network errors (fetch rejects) or HTTP 5xx responses.
  // NEVER retries on 4xx (including 429/401/403) or non-ok non-5xx.
  // Honours Retry-After header (integer seconds) on 5xx when present.
  // Max 3 retries; base delays ~1s, 2s, 4s plus small random jitter.
  //
  // COM-26 Stage C: each per-attempt network call is routed through _schedule()
  // so the global concurrency cap and min-gap pacing are enforced. The
  // AbortController and timeout are created INSIDE the scheduled closure so the
  // 30 s clock starts at dispatch time, not while the task is queued.
  async function fetchWithRetry(url, options) {
    var REQUEST_TIMEOUT_MS = 30000;
    var baseDelays = [1000, 2000, 4000];
    var MAX_RETRIES = baseDelays.length;
    var attempt = 0;

    while (true) {
      // Circuit breaker tripped — stop retrying and bail out immediately
      if (_circuitBroken) {
        throw new Error('circuit_breaker:' + _circuitBreakerReason);
      }

      var response;
      var networkError = null;

      try {
        // Route through the global scheduler: cap=2, min-gap pacing.
        // The controller is created inside the run closure so the timeout clock
        // starts at actual dispatch time (not while the task sits in the queue).
        // requestCount++ is here (at actual dispatch) so drain-rejected attempts
        // (never sent) are not counted.
        response = await _schedule(function () {
          _syncMetrics.requestCount++;
          var controller = new AbortController();
          _inFlightControllers.push(controller);
          var timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
          var fetchOptions = Object.assign({}, options, { signal: controller.signal });
          return fetch(url, fetchOptions).then(
            function (r) {
              clearTimeout(timeoutId);
              var idx = _inFlightControllers.indexOf(controller);
              if (idx !== -1) { _inFlightControllers.splice(idx, 1); }
              return r;
            },
            function (e) {
              clearTimeout(timeoutId);
              var idx = _inFlightControllers.indexOf(controller);
              if (idx !== -1) { _inFlightControllers.splice(idx, 1); }
              throw e;
            }
          );
        });
      } catch (err) {
        networkError = err;
      }

      // Determine whether to retry
      var shouldRetry = false;
      var retryDelayMs = baseDelays[attempt] + Math.floor(Math.random() * 200);

      if (networkError) {
        // Network-level failure (includes AbortError from timeout) — always retryable
        shouldRetry = true;
      } else if (response.status >= 500 && response.status <= 599) {
        // 5xx server error — retryable; honour Retry-After if present (capped to 30s)
        shouldRetry = true;
        var retryAfterHeader = response.headers.get('Retry-After');
        if (retryAfterHeader) {
          var parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            retryDelayMs = Math.min(parsed, 30) * 1000;
          }
        }
      }
      // 4xx (including 429, 401, 403) and non-error non-ok responses: not retried

      if (!shouldRetry) {
        // Success or non-retryable failure — return (caller checks response.ok)
        if (networkError) {
          _syncMetrics.errorCount++;
          throw networkError;
        }

        // Pushback detection (only on non-retryable responses, so 5xx still retries above).
        // HTTP 429 rate limit
        if (response.status === 429) {
          _triggerCircuitBreaker('http_429');
          _syncMetrics.errorCount++;
          throw new Error('pushback_429');
        }
        // Redirect to a challenge / re-login page
        if (response.url && (response.url.indexOf('/challenge') !== -1 || response.url.indexOf('/accounts/login') !== -1)) {
          _triggerCircuitBreaker('challenge_redirect');
          _syncMetrics.errorCount++;
          throw new Error('pushback_challenge');
        }
        // NOTE (hotfix): a non-application/json content-type is NOT pushback.
        // Instagram routinely returns valid JSON with content-types like
        // text/javascript or text/html, and the header says nothing about whether
        // we are actually being blocked. Real pushback is HTTP 429, a /challenge
        // redirect, or genuine checkpoint/spam signals in the PARSED body
        // (_checkPushbackBody). Letting the response through lets the caller's
        // response.json() parse valid bodies normally; a genuinely unparseable body
        // (e.g. an HTML login page) surfaces as an ordinary fetch error / session
        // reconnect — never a 30-minute account lockout.

        return response;
      }

      attempt++;
      if (attempt > MAX_RETRIES) {
        // Exhausted retries
        if (networkError) {
          _syncMetrics.errorCount++;
          throw networkError;
        }
        return response;
      }

      debugLog('[Retry] attempt ' + attempt + ' of ' + MAX_RETRIES + ' after ' + retryDelayMs + 'ms (status: ' + (networkError ? 'network-error' : String(response.status)) + ')');
      // Heartbeat before sleep so the RN watchdog timer keeps resetting across waits
      await new Promise(function(resolve) { setTimeout(resolve, retryDelayMs); });
    }
  }

  // Create Instagram API namespace
  window.instagramAPI = {
    // Reset sync instrumentation metrics at the start of a sync run
    resetSyncMetrics: function() {
      _syncMetrics = { requestCount: 0, pushbackCount: 0, errorCount: 0, startedAt: Date.now() };
    },

    // Reset circuit-breaker state (called before a sync when cooldown has elapsed).
    // Also resets the scheduler via _resetScheduler() so a fresh sync starts with
    // a clean slate and stale in-flight tasks from a previous stall can't corrupt
    // _inFlight of the new sync.
    _resetCircuitBreaker: function() {
      _circuitBroken = false;
      _circuitBreakerReason = null;
      _resetScheduler();
    },

    // Abort all in-flight and queued requests and reset the scheduler state,
    // WITHOUT touching the circuit-breaker flags. Used by the RN stall watchdog
    // to stop a wedged sync from continuing to hammer Instagram after the watchdog
    // has already settled the RN-side sync state.
    _abortAllRequests: function() {
      _resetScheduler();
    },

    // Start polling for ds_user_id cookie
    startLoginPolling: function() {
      if (cookieCheckInterval) return;

      cookieCheckInterval = setInterval(function() {
        if (loginDetected) {
          clearInterval(cookieCheckInterval);
          cookieCheckInterval = null;
          return;
        }

        const userId = getCookie('ds_user_id');
        if (!userId) return;

        loginDetected = true;
        clearInterval(cookieCheckInterval);
        cookieCheckInterval = null;

        // Fetch username from web_form_data
        fetch('https://www.instagram.com/api/v1/accounts/edit/web_form_data/', {
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
          }
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          sendMessage('LOGIN_SUCCESS', {
            userId: userId,
            username: data.form_data?.username
          });
        })
        .catch(function(err) {
          console.error('Failed to fetch form data:', err);
        });
      }, ${COOKIE_POLL_INTERVAL_MS});
    },

    // Stop polling
    stopLoginPolling: function() {
      if (cookieCheckInterval) {
        clearInterval(cookieCheckInterval);
        cookieCheckInterval = null;
      }
    },

    // Clear Instagram session cookies
    clearSession: function() {
      const cookies = ['sessionid', 'ds_user_id', 'csrftoken', 'mid', 'ig_did', 'rur'];
      cookies.forEach(function(name) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.instagram.com';
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      });
    },

    // Logout
    logout: async function(userId) {
      try {
        const formData = new URLSearchParams();
        formData.append('one_tap_app_login', '0');
        formData.append('user_id', userId);

        await fetch('https://www.instagram.com/api/v1/web/accounts/logout/ajax/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '${INSTAGRAM_APP_ID}',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData.toString()
        });

        this.clearSession();
        sendMessage('LOGOUT_SUCCESS', { success: true });
      } catch (error) {
        sendMessage('LOGOUT_ERROR', { error: error.message });
      }
    },

    // Check login status
    checkLoginStatus: async function(userId) {
      try {
        const response = await fetch(
          'https://www.instagram.com/api/v1/friendships/' + userId + '/following/?count=50',
          {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          }
        );

        sendMessage('LOGIN_STATUS_CHECK', {
          success: response.status === 200,
          userId: userId
        });
      } catch (error) {
        sendMessage('LOGIN_STATUS_CHECK', {
          success: false,
          userId: userId,
          error: error.message
        });
      }
    },

    // Fetch following list (REST API)
    fetchFollowing: async function(userId, isMainUser) {
      try {
        var _start = Date.now();
        let allUsers = [];
        let hasMore = true;
        let maxId = null;
        let pageNum = 0;

        while (hasMore) {
          if (_circuitBroken) { return; }
          pageNum++;
          let url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/following/?count=50';
          if (maxId) url += '&max_id=' + maxId;

          debugLog('[Following] Page ' + pageNum + ' - Fetching with maxId:', maxId || 'none');

          const response = await fetchWithRetry(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          });

          debugLog('[Following] Page ' + pageNum + ' - Response status:', response.status);

          if (!response.ok) {
            throw new Error('Failed to fetch following: ' + response.status);
          }

          const data = await response.json();

          if (_checkPushbackBody(data)) { _triggerCircuitBreaker('body_signal'); return; }

          if (data.users && data.users.length > 0) {
            allUsers = allUsers.concat(
              data.users.map(function(user) {
                return {
                  id: user.id || user.pk,
                  username: user.username,
                  full_name: user.full_name || null,
                  profile_pic_url: user.profile_pic_url || null
                };
              })
            );
          }

          hasMore = data.has_more || false;
          maxId = data.next_max_id || null;

          // Inter-page delay — paced via config (COM-26 Stage C)
          if (hasMore) {
            await new Promise(function(resolve) {
              setTimeout(resolve, PACING_CONFIG.INTER_PAGE_DELAY_MIN_MS + Math.floor(Math.random() * PACING_CONFIG.INTER_PAGE_DELAY_JITTER_MS));
            });
          }
        }

        _postSyncMetrics(userId, 'following', pageNum, allUsers.length, Date.now() - _start);
        sendMessage('FOLLOWING_COMPLETE', {
          users: allUsers,
          totalCount: allUsers.length,
          userId: userId,
          isMainUser: isMainUser || false
        });
      } catch (error) {
        sendMessage('FETCH_ERROR', {
          error: error.message,
          userId: userId,
          listType: 'following'
        });
      }
    },

    // Fetch following list using GraphQL API
    fetchFollowingGraphQL: async function(userId, isMainUser) {
      try {
        var _start = Date.now();
        let allUsers = [];
        let hasNextPage = true;
        let endCursor = null;
        let pageNum = 0;
        const QUERY_HASH = '58712303d941c6855d4e888c5f0cd22f';

        debugLog('📥 [Following-GraphQL] Starting fetch for userId:', userId);

        while (hasNextPage) {
          if (_circuitBroken) { return; }
          pageNum++;

          const variables = {
            id: userId,
            include_reel: true,
            fetch_mutual: false,
            first: 50
          };

          if (endCursor) {
            variables.after = endCursor;
          }

          const params = new URLSearchParams({
            query_hash: QUERY_HASH,
            variables: JSON.stringify(variables)
          });

          const url = 'https://www.instagram.com/graphql/query/?' + params.toString();

          debugLog('📥 [Following-GraphQL] Page ' + pageNum + ' - Fetching with cursor:', endCursor || 'none');

          const response = await fetchWithRetry(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          });

          debugLog('📥 [Following-GraphQL] Page ' + pageNum + ' - Response status:', response.status);

          if (!response.ok) {
            throw new Error('Failed to fetch following (GraphQL): ' + response.status);
          }

          const data = await response.json();

          if (_checkPushbackBody(data)) { _triggerCircuitBreaker('body_signal'); return; }

          if (data.status !== 'ok' || !data.data || !data.data.user) {
            throw new Error('Invalid GraphQL response or user not found');
          }

          const edgeFollow = data.data.user.edge_follow;
          const edges = edgeFollow.edges || [];
          const pageInfo = edgeFollow.page_info || {};
          const totalCount = edgeFollow.count;

          debugLog('📥 [Following-GraphQL] Page ' + pageNum + ' - Users in page:', edges.length, '| has_next_page:', pageInfo.has_next_page, '| total_count:', totalCount);

          if (edges.length > 0) {
            allUsers = allUsers.concat(
              edges.map(function(edge) {
                const node = edge.node;
                return {
                  id: node.id,
                  username: node.username,
                  full_name: node.full_name || null,
                  profile_pic_url: node.profile_pic_url || null
                };
              })
            );
          }

          debugLog('📥 [Following-GraphQL] Page ' + pageNum + ' - Total users so far:', allUsers.length);

          hasNextPage = pageInfo.has_next_page || false;
          endCursor = pageInfo.end_cursor || null;

          if (!hasNextPage) {
            debugLog('📥 [Following-GraphQL] No more pages. Final count:', allUsers.length, '| Expected:', totalCount);
          }

          // Inter-page delay — paced via config (COM-26 Stage C)
          if (hasNextPage) {
            await new Promise(function(resolve) {
              setTimeout(resolve, PACING_CONFIG.INTER_PAGE_DELAY_MIN_MS + Math.floor(Math.random() * PACING_CONFIG.INTER_PAGE_DELAY_JITTER_MS));
            });
          }
        }

        debugLog('📥 [Following-GraphQL] Complete! Total fetched:', allUsers.length, 'for userId:', userId);

        _postSyncMetrics(userId, 'following', pageNum, allUsers.length, Date.now() - _start);
        sendMessage('FOLLOWING_COMPLETE', {
          users: allUsers,
          totalCount: allUsers.length,
          userId: userId,
          isMainUser: isMainUser || false,
          method: 'graphql'
        });
      } catch (error) {
        debugLog('📥 [Following-GraphQL] Error:', error.message);
        sendMessage('FETCH_ERROR', {
          error: error.message,
          userId: userId,
          listType: 'following',
          method: 'graphql'
        });
      }
    },

    // Fetch followers list
    fetchFollowers: async function(userId, isMainUser) {
      try {
        var _start = Date.now();
        let allUsers = [];
        let hasMore = true;
        let maxId = null;
        let pageNum = 0;

        debugLog('📥 [Followers] Starting fetch for userId:', userId);

        while (hasMore) {
          if (_circuitBroken) { return; }
          pageNum++;
          let url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/followers/?count=50&search_surface=follow_list_page';
          if (maxId) url += '&max_id=' + maxId;

          debugLog('📥 [Followers] Page ' + pageNum + ' - Fetching with maxId:', maxId || 'none');

          const response = await fetchWithRetry(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          });

          debugLog('📥 [Followers] Page ' + pageNum + ' - Response status:', response.status);

          if (!response.ok) {
            throw new Error('Failed to fetch followers: ' + response.status);
          }

          const data = await response.json();

          if (_checkPushbackBody(data)) { _triggerCircuitBreaker('body_signal'); return; }

          const usersInPage = data.users ? data.users.length : 0;
          debugLog('📥 [Followers] Page ' + pageNum + ' - Users in page:', usersInPage, '| has_more:', data.has_more, '| next_max_id:', data.next_max_id || 'none');

          if (data.users && data.users.length > 0) {
            allUsers = allUsers.concat(
              data.users.map(function(user) {
                return {
                  id: user.id || user.pk,
                  username: user.username,
                  full_name: user.full_name || null,
                  profile_pic_url: user.profile_pic_url || null
                };
              })
            );
          }

          debugLog('📥 [Followers] Page ' + pageNum + ' - Total users so far:', allUsers.length);

          hasMore = data.has_more || false;
          maxId = data.next_max_id || null;

          if (!hasMore) {
            debugLog('📥 [Followers] No more pages. Final count:', allUsers.length);
          }

          // Inter-page delay — paced via config (COM-26 Stage C)
          if (hasMore) {
            await new Promise(function(resolve) {
              setTimeout(resolve, PACING_CONFIG.INTER_PAGE_DELAY_MIN_MS + Math.floor(Math.random() * PACING_CONFIG.INTER_PAGE_DELAY_JITTER_MS));
            });
          }
        }

        debugLog('📥 [Followers] Complete! Total fetched:', allUsers.length, 'for userId:', userId);

        _postSyncMetrics(userId, 'followers', pageNum, allUsers.length, Date.now() - _start);
        sendMessage('FOLLOWERS_COMPLETE', {
          users: allUsers,
          totalCount: allUsers.length,
          userId: userId,
          isMainUser: isMainUser || false
        });
      } catch (error) {
        debugLog('📥 [Followers] Error:', error.message);
        sendMessage('FETCH_ERROR', {
          error: error.message,
          userId: userId,
          listType: 'followers'
        });
      }
    },

    // Fetch followers list using GraphQL API (alternative implementation for benchmarking)
    fetchFollowersGraphQL: async function(userId, isMainUser) {
      try {
        var _start = Date.now();
        let allUsers = [];
        let hasNextPage = true;
        let endCursor = null;
        let pageNum = 0;
        const QUERY_HASH = '37479f2b8209594dde7facb0d904896a';

        debugLog('📥 [Followers-GraphQL] Starting fetch for userId:', userId);

        while (hasNextPage) {
          if (_circuitBroken) { return; }
          pageNum++;

          const variables = {
            id: userId,
            include_reel: true,
            fetch_mutual: false,
            first: 50
          };

          if (endCursor) {
            variables.after = endCursor;
          }

          const params = new URLSearchParams({
            query_hash: QUERY_HASH,
            variables: JSON.stringify(variables)
          });

          const url = 'https://www.instagram.com/graphql/query/?' + params.toString();

          debugLog('📥 [Followers-GraphQL] Page ' + pageNum + ' - Fetching with cursor:', endCursor || 'none');

          const response = await fetchWithRetry(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          });

          debugLog('📥 [Followers-GraphQL] Page ' + pageNum + ' - Response status:', response.status);

          if (!response.ok) {
            throw new Error('Failed to fetch followers (GraphQL): ' + response.status);
          }

          const data = await response.json();

          if (_checkPushbackBody(data)) { _triggerCircuitBreaker('body_signal'); return; }

          if (data.status !== 'ok' || !data.data || !data.data.user) {
            throw new Error('Invalid GraphQL response or user not found');
          }

          const edgeFollowedBy = data.data.user.edge_followed_by;
          const edges = edgeFollowedBy.edges || [];
          const pageInfo = edgeFollowedBy.page_info || {};
          const totalCount = edgeFollowedBy.count;

          debugLog('📥 [Followers-GraphQL] Page ' + pageNum + ' - Users in page:', edges.length, '| has_next_page:', pageInfo.has_next_page, '| total_count:', totalCount);

          if (edges.length > 0) {
            allUsers = allUsers.concat(
              edges.map(function(edge) {
                const node = edge.node;
                return {
                  id: node.id,
                  username: node.username,
                  full_name: node.full_name || null,
                  profile_pic_url: node.profile_pic_url || null
                };
              })
            );
          }

          debugLog('📥 [Followers-GraphQL] Page ' + pageNum + ' - Total users so far:', allUsers.length);

          hasNextPage = pageInfo.has_next_page || false;
          endCursor = pageInfo.end_cursor || null;

          if (!hasNextPage) {
            debugLog('📥 [Followers-GraphQL] No more pages. Final count:', allUsers.length, '| Expected:', totalCount);
          }

          // Inter-page delay — paced via config (COM-26 Stage C)
          if (hasNextPage) {
            await new Promise(function(resolve) {
              setTimeout(resolve, PACING_CONFIG.INTER_PAGE_DELAY_MIN_MS + Math.floor(Math.random() * PACING_CONFIG.INTER_PAGE_DELAY_JITTER_MS));
            });
          }
        }

        debugLog('📥 [Followers-GraphQL] Complete! Total fetched:', allUsers.length, 'for userId:', userId);

        _postSyncMetrics(userId, 'followers', pageNum, allUsers.length, Date.now() - _start);
        sendMessage('FOLLOWERS_COMPLETE', {
          users: allUsers,
          totalCount: allUsers.length,
          userId: userId,
          isMainUser: isMainUser || false,
          method: 'graphql'
        });
      } catch (error) {
        debugLog('📥 [Followers-GraphQL] Error:', error.message);
        sendMessage('FETCH_ERROR', {
          error: error.message,
          userId: userId,
          listType: 'followers',
          method: 'graphql'
        });
      }
    },

    // Fetch user ID by username
    fetchUserId: async function(username) {
      try {
        const response = await fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + username, {
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user profile: ' + response.status);
        }

        const data = await response.json();

        if (data.data && data.data.user && data.data.user.id) {
          const user = data.data.user;
          sendMessage('USER_ID_FETCHED', {
            username: username,
            userId: user.id,
            isPrivate: user.is_private || false,
            followedByViewer: user.followed_by_viewer || false,
            isVerified: user.is_verified || false,
            followersCount: user.edge_followed_by ? user.edge_followed_by.count : 0,
            followingCount: user.edge_follow ? user.edge_follow.count : 0
          });
        } else {
          throw new Error('User ID not found in response');
        }
      } catch (error) {
        sendMessage('USER_ID_FETCHED', {
          username: username,
          error: error.message
        });
      }
    },

    // Fetch account metadata by making API call.
    // COM-26 Stage C: routed through _schedule() so the global cap=2 applies
    // (1 req per account; minor scheduling delay is acceptable).
    fetchAccountMetadata: async function(username) {
      try {
        console.log('🌐 [WebView] Fetching metadata for:', username);
        var REQUEST_TIMEOUT_MS = 30000;
        const response = await _schedule(function () {
          var controller = new AbortController();
          _inFlightControllers.push(controller);
          var timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
          return fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + username, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            },
            signal: controller.signal
          }).then(
            function (r) {
              clearTimeout(timeoutId);
              var idx = _inFlightControllers.indexOf(controller);
              if (idx !== -1) { _inFlightControllers.splice(idx, 1); }
              return r;
            },
            function (e) {
              clearTimeout(timeoutId);
              var idx = _inFlightControllers.indexOf(controller);
              if (idx !== -1) { _inFlightControllers.splice(idx, 1); }
              throw e;
            }
          );
        });

        console.log('🌐 [WebView] Response status:', response.status);

        if (!response.ok) {
          throw new Error('Failed to fetch profile: ' + response.status);
        }

        const data = await response.json();

        if (data.data && data.data.user) {
          const user = data.data.user;
          const followersCount = user.edge_followed_by ? user.edge_followed_by.count : null;
          const followingCount = user.edge_follow ? user.edge_follow.count : null;
          const profilePicUrl = user.profile_pic_url_hd || user.profile_pic_url || null;
          const mediaCount = user.edge_owner_to_timeline_media ? user.edge_owner_to_timeline_media.count : null;

          sendMessage('ACCOUNT_METADATA_FETCHED', {
            userId: user.id,
            username: user.username,
            biography: user.biography || null,
            profilePicUrl: profilePicUrl,
            mediaCount: mediaCount,
            followersCount: followersCount,
            followingCount: followingCount
          });
        } else {
          throw new Error('User data not found in response');
        }
      } catch (error) {
        console.error('❌ Failed to fetch account metadata:', error.message);
        sendMessage('FETCH_ERROR', {
          username: username,
          listType: 'metadata',
          error: error.message
        });
      }
    },

    // Follow a user
    followUser: async function(targetUserId) {
      try {
        debugLog('👤 [Follow] Starting follow for userId:', targetUserId);

        // Get CSRF token from cookies
        const csrfToken = getCookie('csrftoken');
        if (!csrfToken) {
          throw new Error('CSRF token not found');
        }

        const response = await fetch('https://www.instagram.com/api/v1/friendships/create/' + targetUserId + '/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '${INSTAGRAM_APP_ID}',
            'X-CSRFToken': csrfToken,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        debugLog('👤 [Follow] Response status:', response.status);

        if (!response.ok) {
          throw new Error('Failed to follow user: ' + response.status);
        }

        const data = await response.json();
        debugLog('👤 [Follow] Response data:', JSON.stringify(data));

        // Response contains friendship_status with following: true if successful
        const isFollowing = data.friendship_status?.following || data.friendship_status?.outgoing_request || false;
        const isPrivate = data.friendship_status?.is_private || false;

        sendMessage('FOLLOW_USER_RESULT', {
          targetUserId: targetUserId,
          success: true,
          isFollowing: isFollowing,
          isOutgoingRequest: data.friendship_status?.outgoing_request || false,
          isPrivate: isPrivate
        });
      } catch (error) {
        debugLog('👤 [Follow] Error:', error.message);
        sendMessage('FOLLOW_USER_RESULT', {
          targetUserId: targetUserId,
          success: false,
          error: error.message
        });
      }
    },

    // Unfollow a user
    unfollowUser: async function(targetUserId) {
      try {
        debugLog('👤 [Unfollow] Starting unfollow for userId:', targetUserId);

        // Get CSRF token from cookies
        const csrfToken = getCookie('csrftoken');
        if (!csrfToken) {
          throw new Error('CSRF token not found');
        }

        const response = await fetch('https://www.instagram.com/api/v1/friendships/destroy/' + targetUserId + '/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '${INSTAGRAM_APP_ID}',
            'X-CSRFToken': csrfToken,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        debugLog('👤 [Unfollow] Response status:', response.status);

        if (!response.ok) {
          throw new Error('Failed to unfollow user: ' + response.status);
        }

        const data = await response.json();
        debugLog('👤 [Unfollow] Response data:', JSON.stringify(data));

        sendMessage('UNFOLLOW_USER_RESULT', {
          targetUserId: targetUserId,
          success: true,
          isFollowing: data.friendship_status?.following || false
        });
      } catch (error) {
        debugLog('👤 [Unfollow] Error:', error.message);
        sendMessage('UNFOLLOW_USER_RESULT', {
          targetUserId: targetUserId,
          success: false,
          error: error.message
        });
      }
    }
  };
})();
true;
`;
