import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, Modal, Text, Pressable } from 'react-native';
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
  showLogin: () => void;
  reconnect: () => void;
  disconnect: () => void;
  fetchUserId: (username: string) => Promise<UserIdResult>;
  sync: () => void;
  syncTrackedAccount: (userId: string, username: string) => void;
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
    | 'UNFOLLOW_USER_RESULT';
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
}

interface User {
  id: string;
  username: string;
  full_name?: string | null;
  profile_pic_url?: string | null;
}

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
    Map<string, {
      resolve: (result: FollowResult) => void;
      reject: (error: Error) => void;
      username: string;
      profilePicUrl?: string | null;
    }>
  >(new Map());
  const unfollowPromisesRef = useRef<
    Map<string, { resolve: (result: FollowResult) => void; reject: (error: Error) => void }>
  >(new Map());

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

    const apiMethod = FOLLOWING_API_METHOD === 'graphql' ? 'fetchFollowingGraphQL' : 'fetchFollowing';

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

    const apiMethod = FOLLOWERS_API_METHOD === 'graphql' ? 'fetchFollowersGraphQL' : 'fetchFollowers';

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
        const allComplete =
          updatedMain.metadata === 'complete' &&
          updatedMain.following === 'complete' &&
          updatedMain.followers === 'complete';
        const allTrackedComplete = prev.trackedAccounts.every(
          (acc) =>
            acc.metadata === 'complete' &&
            acc.following === 'complete' &&
            acc.followers === 'complete'
        );
        return {
          ...prev,
          mainAccount: updatedMain,
          isActive: !(allComplete && allTrackedComplete),
        };
      }

      // Check tracked accounts
      const trackedIndex = prev.trackedAccounts.findIndex((acc) => acc.userId === targetUserId);
      if (trackedIndex !== -1) {
        const updatedTracked = [...prev.trackedAccounts];
        updatedTracked[trackedIndex] = { ...updatedTracked[trackedIndex], [field]: status };
        // If mainAccount is null, consider it complete (not syncing)
        const mainComplete =
          !prev.mainAccount ||
          (prev.mainAccount.metadata === 'complete' &&
            prev.mainAccount.following === 'complete' &&
            prev.mainAccount.followers === 'complete');
        const allTrackedComplete = updatedTracked.every(
          (acc) =>
            acc.metadata === 'complete' &&
            acc.following === 'complete' &&
            acc.followers === 'complete'
        );
        return {
          ...prev,
          trackedAccounts: updatedTracked,
          isActive: !(mainComplete && allTrackedComplete),
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

    // Initialize sync state with all accounts
    const mainAccountStatus: AccountSyncStatus = {
      userId,
      username: account.instagram_username,
      metadata: 'syncing',
      following: 'syncing',
      followers: 'syncing',
    };

    const trackedAccountStatuses: AccountSyncStatus[] = trackedInstagrams.map((tracked) => ({
      userId: tracked.user_id,
      username: tracked.username,
      metadata: 'syncing',
      following: 'syncing',
      followers: 'syncing',
    }));

    setSyncState({
      isActive: true,
      mainAccount: mainAccountStatus,
      trackedAccounts: trackedAccountStatuses,
    });

    // TODO: Remove this fake delay - for testing sync UI only
    if (FAKE_SYNC_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, FAKE_SYNC_DELAY_MS));
    }

    // Start all fetches in parallel for main account
    fetchMetadata(account.instagram_username);
    fetchFollowing(userId);
    fetchFollowers(userId);

    // Start fetches for tracked accounts with staggered delays
    for (let i = 0; i < trackedInstagrams.length; i++) {
      // Add random delay between accounts to avoid burst requests
      if (i > 0 || true) { // Always delay tracked accounts (main account already started)
        await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));
      }
      const tracked = trackedInstagrams[i];
      fetchMetadata(tracked.username);
      fetchFollowing(tracked.user_id);
      fetchFollowers(tracked.user_id);
    }
  };

  // Sync a single tracked account (used when adding a new tracked account)
  const syncTrackedAccount = (trackedUserId: string, trackedUsername: string) => {
    if (!isLoggedIn || !userId) {
      console.warn('⚠️ Cannot sync tracked account: not logged in');
      return;
    }

    console.log('🔄 Starting sync for tracked account:', trackedUsername);

    // Create sync status for the new tracked account
    const newTrackedStatus: AccountSyncStatus = {
      userId: trackedUserId,
      username: trackedUsername,
      metadata: 'syncing',
      following: 'syncing',
      followers: 'syncing',
    };

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

    // Start fetches for this tracked account
    fetchMetadata(trackedUsername);
    fetchFollowing(trackedUserId);
    fetchFollowers(trackedUserId);
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
  const followUser = ({ targetUserId, targetUsername, targetProfilePicUrl }: FollowUserParams): Promise<FollowResult> => {
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
          fetchingUsersRef.current.delete(data.userId!);
          handleFollowingComplete(data.userId!, data.users!);
          updateAccountSyncStatus(data.userId!, 'following', 'complete');
          break;

        case 'FOLLOWERS_COMPLETE':
          fetchingUsersRef.current.delete(`followers_${data.userId!}`);
          handleFollowersComplete(data.userId!, data.users!);
          updateAccountSyncStatus(data.userId!, 'followers', 'complete');
          break;

        case 'FETCH_ERROR':
          if (data.userId) {
            fetchingUsersRef.current.delete(data.userId);
            fetchingUsersRef.current.delete(`followers_${data.userId}`);
            // Mark both as error since we don't know which one failed
            updateAccountSyncStatus(data.userId, 'following', 'error');
            updateAccountSyncStatus(data.userId, 'followers', 'error');
          }
          console.log('❌ Error:', data.error);
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
              <Text className="text-lg font-semibold">Connect Instagram</Text>
              <Pressable className="px-4 py-2 active:opacity-70" onPress={closeLoginModal}>
                <Text className="text-base font-medium text-blue-500">Cancel</Text>
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

  // Create Instagram API namespace
  window.instagramAPI = {
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
        let allUsers = [];
        let hasMore = true;
        let maxId = null;
        let pageNum = 0;

        while (hasMore) {
          let url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/following/?count=50';
          if (maxId) url += '&max_id=' + maxId;

          const response = await fetch(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch following: ' + response.status);
          }

          const data = await response.json();

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

          // Rate limiting - randomized delay between requests
          if (hasMore) {
            await new Promise(function(resolve) {
              setTimeout(resolve, 500 + Math.random() * 500);
            });
          }
        }

        sendMessage('FOLLOWING_COMPLETE', {
          users: allUsers,
          totalCount: allUsers.length,
          userId: userId,
          isMainUser: isMainUser || false
        });
      } catch (error) {
        sendMessage('FETCH_ERROR', {
          error: error.message,
          userId: userId
        });
      }
    },

    // Fetch following list using GraphQL API
    fetchFollowingGraphQL: async function(userId, isMainUser) {
      try {
        let allUsers = [];
        let hasNextPage = true;
        let endCursor = null;
        let pageNum = 0;
        const QUERY_HASH = '58712303d941c6855d4e888c5f0cd22f';

        debugLog('📥 [Following-GraphQL] Starting fetch for userId:', userId);

        while (hasNextPage) {
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

          const response = await fetch(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });

          debugLog('📥 [Following-GraphQL] Page ' + pageNum + ' - Response status:', response.status);

          if (!response.ok) {
            throw new Error('Failed to fetch following (GraphQL): ' + response.status);
          }

          const data = await response.json();

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

          // Rate limiting - randomized delay between requests
          if (hasNextPage) {
            await new Promise(function(resolve) {
              setTimeout(resolve, 500 + Math.random() * 500);
            });
          }
        }

        debugLog('📥 [Following-GraphQL] Complete! Total fetched:', allUsers.length, 'for userId:', userId);

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
          method: 'graphql'
        });
      }
    },

    // Fetch followers list
    fetchFollowers: async function(userId, isMainUser) {
      try {
        let allUsers = [];
        let hasMore = true;
        let maxId = null;
        let pageNum = 0;

        debugLog('📥 [Followers] Starting fetch for userId:', userId);

        while (hasMore) {
          pageNum++;
          let url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/followers/?count=50&search_surface=follow_list_page';
          if (maxId) url += '&max_id=' + maxId;

          debugLog('📥 [Followers] Page ' + pageNum + ' - Fetching with maxId:', maxId || 'none');

          const response = await fetch(url, {
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

          // Rate limiting - randomized delay between requests
          if (hasMore) {
            await new Promise(function(resolve) {
              setTimeout(resolve, 500 + Math.random() * 500);
            });
          }
        }

        debugLog('📥 [Followers] Complete! Total fetched:', allUsers.length, 'for userId:', userId);

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
          userId: userId
        });
      }
    },

    // Fetch followers list using GraphQL API (alternative implementation for benchmarking)
    fetchFollowersGraphQL: async function(userId, isMainUser) {
      try {
        let allUsers = [];
        let hasNextPage = true;
        let endCursor = null;
        let pageNum = 0;
        const QUERY_HASH = '37479f2b8209594dde7facb0d904896a';

        debugLog('📥 [Followers-GraphQL] Starting fetch for userId:', userId);

        while (hasNextPage) {
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

          const response = await fetch(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest'
            }
          });

          debugLog('📥 [Followers-GraphQL] Page ' + pageNum + ' - Response status:', response.status);

          if (!response.ok) {
            throw new Error('Failed to fetch followers (GraphQL): ' + response.status);
          }

          const data = await response.json();

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

          // Rate limiting - randomized delay between requests
          if (hasNextPage) {
            await new Promise(function(resolve) {
              setTimeout(resolve, 500 + Math.random() * 500);
            });
          }
        }

        debugLog('📥 [Followers-GraphQL] Complete! Total fetched:', allUsers.length, 'for userId:', userId);

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

    // Fetch account metadata by making API call
    fetchAccountMetadata: async function(username) {
      try {
        console.log('🌐 [WebView] Fetching metadata for:', username);
        const response = await fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + username, {
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
          }
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
