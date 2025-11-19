import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, Modal, Text, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSQLiteContext } from 'expo-sqlite';
import { useStorage } from '~/lib/useStorage';
import { useConnectInstagram, useDisconnectInstagram } from '~/lib/useAccount';
import { useAccountContext } from './AccountContext';
import { syncFollowingList } from '~/lib/syncing';
import { clearAllData } from '~/lib/database';

// Constants
const INSTAGRAM_APP_ID = '936619743392459';
const COOKIE_POLL_INTERVAL_MS = 1000;
const LOGIN_CHECK_DELAY_MS = 500;
const FETCH_FOLLOWING_DELAY_MS = 1000;

// Types
interface InstagramContextType {
  isLoggedIn: boolean | null;
  userId: string | null;
  isLoadingUserId: boolean;
  isSyncing: boolean;
  showLogin: () => void;
  disconnect: () => void;
  fetchUserId: (username: string) => Promise<string>;
  syncFollowing: (instagramUserId: string) => void;
}

interface WebViewMessage {
  type: 'LOGIN_SUCCESS' | 'LOGOUT_SUCCESS' | 'LOGIN_STATUS_CHECK' | 'FOLLOWING_COMPLETE' | 'FETCH_ERROR' | 'LOGOUT_ERROR' | 'USER_ID_FETCHED';
  userId?: string;
  username?: string;
  success?: boolean;
  users?: Array<{ id: string; username: string }>;
  isMainUser?: boolean;
  error?: string;
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

  // Account context
  const { account, trackedAccounts } = useAccountContext();
  const connectInstagram = useConnectInstagram();
  const disconnectInstagram = useDisconnectInstagram();

  // State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [[isLoadingUserId, userId], setUserId] = useStorage('instagram_user_id');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [webViewReady, setWebViewReady] = useState(false);

  // Refs
  const webViewRef = useRef<WebView>(null);
  const fetchingUsersRef = useRef<Set<string>>(new Set());
  const justLoggedInRef = useRef(false);
  const pendingFetchUserIdRef = useRef<string | null>(null);
  const pendingLoginCheckRef = useRef<string | null>(null);
  const userIdFetchPromisesRef = useRef<Map<string, { resolve: (userId: string) => void; reject: (error: Error) => void }>>(new Map());

  // Fetch following list for a user (internal helper)
  const fetchFollowing = (userIdToFetch: string, isMainUser: boolean = false) => {
    if (!webViewRef.current) return;

    if (fetchingUsersRef.current.has(userIdToFetch)) {
      return;
    }

    fetchingUsersRef.current.add(userIdToFetch);
    setIsSyncing(true);

    injectJS(`
      if (window.instagramAPI?.fetchFollowing) {
        window.instagramAPI.fetchFollowing('${userIdToFetch}', ${isMainUser});
      }
    `);
  };

  // Check login status when userId and WebView are ready
  useEffect(() => {
    if (isLoadingUserId) return;

    if (userId && webViewReady) {
      if (!justLoggedInRef.current) {
        checkLoginStatus(userId);
      }
    } else if (!userId && webViewReady) {
      setIsLoggedIn(false);
      clearWebViewSession();
    } else if (!userId) {
      setIsLoggedIn(false);
    } else if (userId && !webViewReady) {
      pendingLoginCheckRef.current = userId;
    }
  }, [isLoadingUserId, userId, webViewReady]);

  // Sync connected account when logged in and verify account matches
  useEffect(() => {
    if (!isLoggedIn || !webViewReady || !userId || !account) return;

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

    fetchFollowing(userId, false);
  }, [isLoggedIn, webViewReady, userId, account]);

  // Sync tracked accounts when logged in and tracked accounts change
  useEffect(() => {
    if (!isLoggedIn || !webViewReady || trackedAccounts.length === 0) return;

    trackedAccounts.forEach((trackedAccount) => {
      fetchFollowing(trackedAccount.user_id, false);
    });
  }, [isLoggedIn, webViewReady, trackedAccounts]);

  // Inject JavaScript helper
  const injectJS = (code: string) => {
    webViewRef.current?.injectJavaScript(`(function(){${code}})(); true;`);
  };

  // Clear WebView session
  const clearWebViewSession = () => {
    if (!webViewRef.current) return;

    injectJS(`
      if (window.instagramAPI?.clearSession) {
        window.instagramAPI.clearSession();
      }
    `);

    webViewRef.current.clearCache?.(true);
  };

  // Check if user is still logged in
  const checkLoginStatus = (userIdToCheck: string) => {
    if (!webViewRef.current) return;

    injectJS(`
      if (window.instagramAPI?.checkLoginStatus) {
        window.instagramAPI.checkLoginStatus('${userIdToCheck}');
      }
    `);
  };

  // Public API to sync an Instagram account's following list
  const syncFollowing = (instagramUserId: string) => {
    if (!isLoggedIn) {
      console.warn('Cannot sync: not logged in');
      return;
    }
    fetchFollowing(instagramUserId, false);
  };

  // Disconnect (logout)
  const handleDisconnect = () => {
    if (!webViewRef.current || !userId) return;

    injectJS(`
      if (window.instagramAPI?.logout) {
        window.instagramAPI.logout('${userId}');
      }
    `);
  };

  // Fetch user ID by username
  const fetchUserId = (username: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!webViewRef.current) {
        reject(new Error('WebView not ready'));
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

  // Handle following list completion
  const handleFollowingComplete = async (userId: string, users: User[]) => {
    // Deduplicate users
    const deduplicatedUsers = Array.from(
      new Map(users.map((user) => [user.id, user])).values()
    );

    try {
      // Sync to SQLite
      await syncFollowingList(db, userId, deduplicatedUsers);
    } catch (error) {
      console.error(`Error syncing following list for ${userId}:`, error);
    }
  };

  // Close login modal and stop polling
  const closeLoginModal = () => {
    injectJS(`
      if (window.instagramAPI?.stopLoginPolling) {
        window.instagramAPI.stopLoginPolling();
      }
    `);
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
          break;

        case 'LOGOUT_SUCCESS':
          setUserId(null);
          setIsLoggedIn(false);
          setIsSyncing(false);
          fetchingUsersRef.current.clear();
          webViewRef.current?.clearCache?.(true);

          // Disconnect Instagram account
          if (account?.uuid) {
            disconnectInstagram.mutate({
              uuid: account.uuid,
            });
          }
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

          // Check if all fetches are complete
          if (fetchingUsersRef.current.size === 0) {
            setIsSyncing(false);
          }
          break;

        case 'FETCH_ERROR':
          if (data.userId) {
            fetchingUsersRef.current.delete(data.userId);
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
              promise.resolve(data.userId);
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
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };

  // Handle WebView load
  const handleWebViewLoad = () => {
    setWebViewReady(true);

    // Start login polling when WebView loads in login modal
    if (showLoginModal) {
      injectJS(`
        if (window.instagramAPI?.startLoginPolling) {
          window.instagramAPI.startLoginPolling();
        }
      `);
    }

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
    syncFollowing,
  };

  return (
    <InstagramContext.Provider value={value}>
      {children}

      {/* WebView - visible in modal for login, hidden for background API calls */}
      {showLoginModal ? (
        <Modal visible={showLoginModal} animationType="slide" presentationStyle="pageSheet">
          <View className="flex-1 bg-white">
            <View className="flex-row items-center justify-between border-b border-gray-200 p-4">
              <Text className="text-lg font-semibold">Connect Instagram</Text>
              <Pressable className="px-4 py-2 active:opacity-70" onPress={closeLoginModal}>
                <Text className="text-base font-medium text-blue-500">Cancel</Text>
              </Pressable>
            </View>
            <WebView
              ref={webViewRef}
              source={{ uri: 'https://www.instagram.com/accounts/login/' }}
              className="flex-1"
              onMessage={handleMessage}
              onLoad={handleWebViewLoad}
              injectedJavaScriptBeforeContentLoaded={instagramAPI}
              sharedCookiesEnabled={true}
            />
          </View>
        </Modal>
      ) : (
        <View style={{ height: 0, width: 0, opacity: 0 }}>
          <WebView
            ref={webViewRef}
            source={{ uri: 'https://www.instagram.com/' }}
            onMessage={handleMessage}
            onLoad={handleWebViewLoad}
            injectedJavaScriptBeforeContentLoaded={instagramAPI}
            sharedCookiesEnabled={true}
          />
        </View>
      )}
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
                return { id: user.id || user.pk, username: user.username };
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
          sendMessage('USER_ID_FETCHED', {
            username: username,
            userId: data.data.user.id
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
    }
  };
})();
true;
`;
