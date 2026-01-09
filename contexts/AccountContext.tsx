import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useSQLiteContext } from 'expo-sqlite';
import { useAccount, useCreateAccount } from '~/lib/useAccount';
import { useTrackedInstagrams } from '~/lib/useInstagram';
import { useSecureStorage } from '~/lib/useSecureStorage';
import { setStorageItemAsync } from '~/lib/useStorage';
import { clearAllData } from '~/lib/database';
import { Account, Instagram } from '~/lib/types';
import { CustomerIO } from 'customerio-reactnative';
import * as Notifications from 'expo-notifications';
import { analytics } from '~/contexts/AnalyticsContext';
import { useApi } from '~/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const ACCOUNT_ID_KEY = 'account_id';

interface AccountContextType {
  account: Account | null;
  trackedInstagrams: Instagram[];
  isLoading: boolean;
  updateAccountSettings: (settings: Record<string, boolean>) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccountContext = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccountContext must be used within AccountProvider');
  }
  return context;
};

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const storage = useSecureStorage();
  const api = useApi();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const [storedAccountId, setStoredAccountId] = useState<string | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(true);

  // Check for stored account ID on mount
  useEffect(() => {
    const checkStoredAccountId = async () => {
      const accountId = await storage.getItem(ACCOUNT_ID_KEY);
      setStoredAccountId(accountId);
      setIsCheckingStorage(false);
    };
    checkStoredAccountId();
  }, []);

  // Fetch existing account if account ID exists
  const {
    data: existingAccount,
    isLoading: isFetchingAccount,
    error: fetchError,
  } = useAccount(storedAccountId);

  // Fetch tracked accounts for this account
  const {
    data: trackedInstagrams = [],
    isLoading: isFetchingTracks,
  } = useTrackedInstagrams(storedAccountId);

  // Create new account mutation
  const createAccount = useCreateAccount();

  // Handle 404 error - account no longer exists
  useEffect(() => {
    const handleAccountNotFound = async () => {
      if (fetchError && 'response' in fetchError && fetchError.response?.status === 404) {
        console.log('Account not found (404), clearing stored ID and creating new account');
        await storage.removeItem(ACCOUNT_ID_KEY);
        setStoredAccountId(null);
      }
    };
    handleAccountNotFound();
  }, [fetchError]);

  // Create new account if no account ID exists
  useEffect(() => {
    const createNewAccount = async () => {
      if (!isCheckingStorage && !storedAccountId && !createAccount.isPending) {
        try {
          const newAccount = await createAccount.mutateAsync();
          await storage.setItem(ACCOUNT_ID_KEY, newAccount.uuid);
          setStoredAccountId(newAccount.uuid);
        } catch (error) {
          console.error('Failed to create account:', error);
        }
      }
    };
    createNewAccount();
  }, [isCheckingStorage, storedAccountId, createAccount.isPending]);

  // Determine account and loading state
  const account = existingAccount || createAccount.data || null;
  const isLoading =
    isCheckingStorage || isFetchingAccount || isFetchingTracks || createAccount.isPending;

  // Identify user with Customer.io when account is available
  useEffect(() => {
    const identifyCustomerIO = async () => {
      if (account?.uuid) {
        console.log('Identifying user with Customer.io:', account.uuid);
        CustomerIO.identify({
          userId: account.uuid,
        });

        // Identify user with analytics providers
        analytics.identify(account.uuid);

        // Register device push token only if permission is already granted
        try {
          const { status } = await Notifications.getPermissionsAsync();
          if (status === 'granted') {
            const { data: deviceToken } = await Notifications.getDevicePushTokenAsync();
            if (Platform.OS === 'ios' && deviceToken) {
              console.log('🔧 Registering iOS push token with Customer.io:', deviceToken);
              CustomerIO.registerDeviceToken(deviceToken);
            }
          } else {
            console.log('⚠️ Push notification permission not granted yet');
          }
        } catch (error) {
          console.log('⚠️ Could not get push token:', error);
        }
      }
    };

    identifyCustomerIO();
  }, [account?.uuid]);

  // Set Customer.io profile attributes when account changes
  useEffect(() => {
    if (account) {
      CustomerIO.setProfileAttributes({
        notification_account: account.notification_account,
        notification_tracked: account.notification_tracked,
        notification_marketing: account.notification_marketing,
      });
      console.log('🔧 Updated Customer.io profile attributes');
    }
  }, [account?.notification_account, account?.notification_tracked, account?.notification_marketing]);

  // Update account settings
  const updateAccountSettings = async (settings: Record<string, boolean>) => {
    if (!account?.uuid) {
      throw new Error('No account available');
    }

    try {
      await api.patch(`/api/v1/account/${account.uuid}/settings/`, settings);
      console.log('Updated account settings:', settings);
      // Invalidate account query to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['account', account.uuid] });
    } catch (error) {
      console.error('Error updating account settings:', error);
      throw error;
    }
  };

  // Delete account and all associated data
  const deleteAccount = async () => {
    if (!account?.uuid) {
      throw new Error('No account available');
    }

    console.log('Starting account deletion...');

    // 1. Untrack all tracked accounts (API + local cleanup)
    for (const tracked of trackedInstagrams) {
      try {
        console.log(`Untracking ${tracked.username}...`);
        await api.delete(`/api/v1/account/${account.uuid}/tracks/${tracked.user_id}/`);
      } catch (error) {
        console.error(`Failed to untrack ${tracked.username}:`, error);
      }
    }

    // 2. Disconnect Instagram from backend
    if (account.instagram_user_id) {
      try {
        console.log('Disconnecting Instagram from backend...');
        await api.delete(`/api/v1/account/${account.uuid}/instagram/`);
      } catch (error) {
        console.error('Failed to disconnect Instagram:', error);
      }
    }

    // 3. Clear all SQLite data
    console.log('Clearing local database...');
    await clearAllData(db);

    // 4. Delete instagram_user_id from AsyncStorage
    console.log('Clearing instagram_user_id...');
    await setStorageItemAsync('instagram_user_id', null);

    // 5. Delete account_id from SecureStore
    console.log('Clearing account_id...');
    await storage.removeItem(ACCOUNT_ID_KEY);

    // 6. Delete account from backend
    try {
      console.log('Deleting account from backend...');
      await api.delete(`/api/v1/account/${account.uuid}/`);
    } catch (error) {
      console.error('Failed to delete account from backend:', error);
    }

    // 7. Clear all query caches
    queryClient.clear();

    // 8. Reset local state
    setStoredAccountId(null);

    console.log('Account deletion complete');
  };

  // Hide splash screen and render children only when initialization is complete
  if (isLoading) {
    return null;
  }

  // Hide splash screen now that we're ready
  SplashScreen.hideAsync();

  const value: AccountContextType = {
    account,
    trackedInstagrams,
    isLoading,
    updateAccountSettings,
    deleteAccount,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};
