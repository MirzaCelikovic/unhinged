import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, Modal, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSQLiteContext } from 'expo-sqlite';
import { useQueryClient } from '@tanstack/react-query';
import { useStorage } from '~/lib/useStorage';
import { useConnectInstagram, useDisconnectInstagram } from '~/lib/useAccount';
import { useAccountContext } from './AccountContext';
import { useSheets } from './SheetContext';
import { syncFollowingList, syncFollowersList } from '~/lib/syncing';
import { clearAllData } from '~/lib/database';
import * as Notifications from 'expo-notifications';

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
}

interface InstagramContextType {
  isLoggedIn: boolean | null;
  userId: string | null;
  isLoadingUserId: boolean;
  isSyncing: boolean;
  showLogin: () => void;
  disconnect: () => void;
  fetchUserId: (username: string) => Promise<UserIdResult>;
  fetchAccountMetadata: (username: string) => Promise<void>;
  syncUser: (userId: string) => Promise<void>;
  sync: () => void;
}

interface WebViewMessage {
  type: 'LOGIN_SUCCESS' | 'LOGOUT_SUCCESS' | 'LOGIN_STATUS_CHECK' | 'FOLLOWING_COMPLETE' | 'FOLLOWERS_COMPLETE' | 'FETCH_ERROR' | 'LOGOUT_ERROR' | 'USER_ID_FETCHED' | 'ACCOUNT_METADATA_FETCHED';
  userId?: string;
  username?: string;
  success?: boolean;
  users?: Array<{ id: string; username: string }>;
  isMainUser?: boolean;
  error?: string;
  biography?: string | null;
  mediaCount?: number | null;
  isPrivate?: boolean;
  followedByViewer?: boolean;
}

interface User {
  id: string;
  username: string;
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
  const { showNotificationsSheet } = useSheets();

  // State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [[isLoadingUserId, userId], setUserId] = useStorage('instagram_user_id');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [apiWebViewReady, setApiWebViewReady] = useState(false);

  // Refs
  const loginWebViewRef = useRef<WebView>(null);
  const apiWebViewRef = useRef<WebView>(null);
  const fetchingUsersRef = useRef<Set<string>>(new Set());
  const justLoggedInRef = useRef(false);
  const pendingFetchUserIdRef = useRef<string | null>(null);
  const pendingLoginCheckRef = useRef<string | null>(null);
  const userIdFetchPromisesRef = useRef<Map<string, { resolve: (result: UserIdResult) => void; reject: (error: Error) => void }>>(new Map());
  const metadataFetchPromisesRef = useRef<Map<string, { resolve: () => void; reject: (error: Error) => void }>>(new Map());
  const syncUserPromisesRef = useRef<Map<string, { resolve: () => void; reject: (error: Error) => void; followingComplete: boolean; followersComplete: boolean }>>(new Map());

  // Fetch following list for a user (internal helper)
  const fetchFollowing = (userIdToFetch: string, isMainUser: boolean = false) => {
    if (!apiWebViewRef.current) {
      console.warn('⚠️ fetchFollowing: API WebView not ready');
      return;
    }

    if (fetchingUsersRef.current.has(userIdToFetch)) {
      console.log('⏭️ Skipping duplicate fetch for:', userIdToFetch);
      return;
    }

    console.log('🔄 fetchFollowing:', userIdToFetch, 'apiWebViewReady:', apiWebViewReady);
    fetchingUsersRef.current.add(userIdToFetch);
    setIsSyncing(true);

    apiWebViewRef.current.injectJavaScript(`(function(){
      console.log('📱 Injecting fetchFollowing for userId:', '${userIdToFetch}');
      if (window.instagramAPI?.fetchFollowing) {
        window.instagramAPI.fetchFollowing('${userIdToFetch}', ${isMainUser});
      } else {
        console.error('❌ window.instagramAPI.fetchFollowing not available');
      }
    })(); true;`);
  };

  // Fetch followers list for a user (internal helper)
  const fetchFollowers = (userIdToFetch: string, isMainUser: boolean = false) => {
    if (!apiWebViewRef.current) {
      console.warn('⚠️ fetchFollowers: API WebView not ready');
      return;
    }

    if (fetchingUsersRef.current.has(`followers_${userIdToFetch}`)) {
      console.log('⏭️ Skipping duplicate fetch for followers:', userIdToFetch);
      return;
    }

    console.log('🔄 fetchFollowers:', userIdToFetch, 'apiWebViewReady:', apiWebViewReady);
    fetchingUsersRef.current.add(`followers_${userIdToFetch}`);
    setIsSyncing(true);

    apiWebViewRef.current.injectJavaScript(`(function(){
      console.log('📱 Injecting fetchFollowers for userId:', '${userIdToFetch}');
      if (window.instagramAPI?.fetchFollowers) {
        window.instagramAPI.fetchFollowers('${userIdToFetch}', ${isMainUser});
      } else {
        console.error('❌ window.instagramAPI.fetchFollowers not available');
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

  // Sync a specific user (returns promise that resolves when both following and followers are complete)
  const syncUser = (userIdToSync: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!isLoggedIn) {
        reject(new Error('Not logged in'));
        return;
      }

      // Track this sync
      syncUserPromisesRef.current.set(userIdToSync, {
        resolve,
        reject,
        followingComplete: false,
        followersComplete: false,
      });

      // Fetch both following and followers
      fetchFollowing(userIdToSync, false);
      fetchFollowers(userIdToSync, false);
    });
  };

  // Public API to sync all accounts (main user + tracked accounts)
  const sync = () => {
    if (!isLoggedIn || !userId) {
      console.warn('⚠️ Cannot sync: not logged in', { isLoggedIn, userId });
      return;
    }

    console.log('🔄 Starting sync - userId:', userId, 'tracked accounts:', trackedInstagrams.length);

    // Sync the main user (following + followers)
    fetchFollowing(userId, false);
    fetchFollowers(userId, false);

    // Fetch metadata for main user
    if (account?.instagram_username) {
      injectJS(`
        if (window.instagramAPI?.fetchAccountMetadata) {
          window.instagramAPI.fetchAccountMetadata('${account.instagram_username}');
        }
      `);
    }

    // Sync all tracked accounts (following + followers)
    trackedInstagrams.forEach((trackedInstagram) => {
      fetchFollowing(trackedInstagram.user_id, false);
      fetchFollowers(trackedInstagram.user_id, false);

      // Fetch metadata for tracked account
      injectJS(`
        if (window.instagramAPI?.fetchAccountMetadata) {
          window.instagramAPI.fetchAccountMetadata('${trackedInstagram.username}');
        }
      `);
    });
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

  // Fetch account metadata (bio, media count, etc.) by navigating to profile
  const fetchAccountMetadata = (username: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!apiWebViewRef.current) {
        console.log('❌ API WebView not ready for fetchAccountMetadata');
        reject(new Error('API WebView not ready'));
        return;
      }

      if (!apiWebViewReady) {
        console.log('⏳ API WebView not ready yet, waiting...');
        // Wait a bit for WebView to load
        setTimeout(() => {
          fetchAccountMetadata(username).then(resolve).catch(reject);
        }, 500);
        return;
      }

      console.log('📝 Storing promise for username:', username, 'apiWebViewReady:', apiWebViewReady);
      metadataFetchPromisesRef.current.set(username, { resolve, reject });

      console.log('💉 Injecting fetchAccountMetadata for:', username);
      injectJS(`
        if (window.instagramAPI?.fetchAccountMetadata) {
          window.instagramAPI.fetchAccountMetadata('${username}');
        } else {
          console.error('❌ window.instagramAPI.fetchAccountMetadata not available');
        }
      `);
    });
  };

  // Handle following list completion
  const handleFollowingComplete = async (userId: string, users: User[]) => {
    // Deduplicate users
    const deduplicatedUsers = Array.from(
      new Map(users.map((user) => [user.id, user])).values()
    );

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
    const deduplicatedUsers = Array.from(
      new Map(users.map((user) => [user.id, user])).values()
    );

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
          setUserId(data.userId!);
          setIsLoggedIn(true);

          // Connect Instagram account
          if (account?.uuid && data.userId && data.username) {
            connectInstagram.mutate({
              uuid: account.uuid,
              userId: data.userId,
              username: data.username,
            });
          }

          // Show notification sheet if permission is undetermined
          const checkAndShowNotificationSheet = async () => {
            const { status } = await Notifications.getPermissionsAsync();
            console.log('🔔 Notification permission status after login:', status);
            if (status === 'undetermined') {
              console.log('🔔 Showing notifications sheet');
              showNotificationsSheet();
            }
          };
          checkAndShowNotificationSheet();
          break;

        case 'LOGOUT_SUCCESS':
          setUserId(null);
          setIsLoggedIn(false);
          setIsSyncing(false);
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
          } else {
            setIsLoggedIn(false);
            setUserId(null);
          }
          break;

        case 'FOLLOWING_COMPLETE':
          fetchingUsersRef.current.delete(data.userId!);
          handleFollowingComplete(data.userId!, data.users!);

          // Check if syncUser promise should be resolved
          const syncPromiseFollowing = syncUserPromisesRef.current.get(data.userId!);
          if (syncPromiseFollowing) {
            syncPromiseFollowing.followingComplete = true;
            if (syncPromiseFollowing.followingComplete && syncPromiseFollowing.followersComplete) {
              syncPromiseFollowing.resolve();
              syncUserPromisesRef.current.delete(data.userId!);
            }
          }

          // Check if all fetches are complete
          if (fetchingUsersRef.current.size === 0) {
            setIsSyncing(false);
          }
          break;

        case 'FOLLOWERS_COMPLETE':
          fetchingUsersRef.current.delete(`followers_${data.userId!}`);
          handleFollowersComplete(data.userId!, data.users!);

          // Check if syncUser promise should be resolved
          const syncPromiseFollowers = syncUserPromisesRef.current.get(data.userId!);
          if (syncPromiseFollowers) {
            syncPromiseFollowers.followersComplete = true;
            if (syncPromiseFollowers.followingComplete && syncPromiseFollowers.followersComplete) {
              syncPromiseFollowers.resolve();
              syncUserPromisesRef.current.delete(data.userId!);
            }
          }

          // Check if all fetches are complete
          if (fetchingUsersRef.current.size === 0) {
            setIsSyncing(false);
          }
          break;

        case 'FETCH_ERROR':
          if (data.userId) {
            fetchingUsersRef.current.delete(data.userId);
            fetchingUsersRef.current.delete(`followers_${data.userId}`);
          }
          console.error('❌ Error:', data.error);

          if (fetchingUsersRef.current.size === 0) {
            setIsSyncing(false);
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
                console.log(`📝 Storing metadata for ${data.username}:`, {
                  userId: data.userId,
                  profilePicUrl: data.profilePicUrl,
                  biography: data.biography,
                  mediaCount: data.mediaCount
                });
                await db.runAsync(
                  `INSERT INTO instagrams (user_id, username, profile_pic_url, biography, media_count, date_created, date_updated)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     profile_pic_url = ?,
                     biography = ?,
                     media_count = ?,
                     date_updated = ?`,
                  [data.userId, data.username, data.profilePicUrl, data.biography, data.mediaCount, now, now, data.profilePicUrl, data.biography, data.mediaCount, now]
                );
                console.log(`✅ Updated metadata for ${data.username}: pic="${data.profilePicUrl}", bio="${data.biography}", posts=${data.mediaCount}`);

                // Resolve promise if one exists
                const promise = metadataFetchPromisesRef.current.get(data.username);
                if (promise) {
                  promise.resolve();
                  metadataFetchPromisesRef.current.delete(data.username);
                }
              } catch (error) {
                console.error('Error updating account metadata:', error);
                const promise = metadataFetchPromisesRef.current.get(data.username);
                if (promise) {
                  promise.reject(new Error('Failed to update metadata'));
                  metadataFetchPromisesRef.current.delete(data.username);
                }
              }
            };
            updateMetadata();
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
        fetchFollowing(userIdToFetch, true);
        justLoggedInRef.current = false;
      }, FETCH_FOLLOWING_DELAY_MS);
    }
  };

  // Show login modal
  const showLogin = () => setShowLoginModal(true);

  // Context value
  const value: InstagramContextType = {
    isLoggedIn,
    userId,
    isLoadingUserId,
    isSyncing,
    showLogin,
    disconnect: handleDisconnect,
    fetchUserId,
    fetchAccountMetadata,
    syncUser,
    sync,
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

    // Fetch following list
    fetchFollowing: async function(userId, isMainUser) {
      try {
        let allUsers = [];
        let hasMore = true;
        let maxId = null;

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
                  profile_pic_url: user.profile_pic_url || null
                };
              })
            );
          }

          hasMore = data.has_more || false;
          maxId = data.next_max_id || null;
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

    // Fetch followers list
    fetchFollowers: async function(userId, isMainUser) {
      try {
        let allUsers = [];
        let hasMore = true;
        let maxId = null;

        while (hasMore) {
          let url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/followers/?count=50';
          if (maxId) url += '&max_id=' + maxId;

          const response = await fetch(url, {
            credentials: 'include',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'X-IG-App-ID': '${INSTAGRAM_APP_ID}'
            }
          });

          if (!response.ok) {
            throw new Error('Failed to fetch followers: ' + response.status);
          }

          const data = await response.json();

          if (data.users && data.users.length > 0) {
            allUsers = allUsers.concat(
              data.users.map(function(user) {
                return {
                  id: user.id || user.pk,
                  username: user.username,
                  profile_pic_url: user.profile_pic_url || null
                };
              })
            );
          }

          hasMore = data.has_more || false;
          maxId = data.next_max_id || null;
        }

        sendMessage('FOLLOWERS_COMPLETE', {
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
            followedByViewer: user.followed_by_viewer || false
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
          const profilePicUrl = user.profile_pic_url_hd || user.profile_pic_url || null;
          console.log('🌐 [WebView] Sending ACCOUNT_METADATA_FETCHED for:', user.username);
          console.log('🌐 [WebView] Profile pic URL:', profilePicUrl);
          console.log('🌐 [WebView] Biography:', user.biography);
          console.log('🌐 [WebView] Media count:', user.edge_owner_to_timeline_media ? user.edge_owner_to_timeline_media.count : null);
          sendMessage('ACCOUNT_METADATA_FETCHED', {
            userId: user.id,
            username: user.username,
            biography: user.biography || null,
            mediaCount: user.edge_owner_to_timeline_media ? user.edge_owner_to_timeline_media.count : null,
            profilePicUrl: profilePicUrl
          });
        } else {
          throw new Error('User data not found in response');
        }
      } catch (error) {
        console.error('❌ Failed to fetch account metadata:', error.message);
      }
    }
  };
})();
true;
`;
