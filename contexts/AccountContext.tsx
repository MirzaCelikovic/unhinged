import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View, Platform } from 'react-native';
import { useAccount, useCreateAccount } from '~/lib/useAccount';
import { useTrackedInstagrams } from '~/lib/useInstagram';
import { useSecureStorage } from '~/lib/useSecureStorage';
import { Account, Instagram } from '~/lib/types';
import { CustomerIO } from 'customerio-reactnative';
import * as Notifications from 'expo-notifications';
import { useApi } from '~/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const ACCOUNT_ID_KEY = 'account_id';

interface AccountContextType {
  account: Account | null;
  trackedInstagrams: Instagram[];
  isLoading: boolean;
  updateAccountSettings: (settings: Record<string, boolean>) => Promise<void>;
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
        console.log('🔧 Identifying user with Customer.io:', account.uuid);
        CustomerIO.identify({
          userId: account.uuid,
        });

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

  // Show loading screen while initializing
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6b7280" />
      </View>
    );
  }

  const value: AccountContextType = {
    account,
    trackedInstagrams,
    isLoading,
    updateAccountSettings,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};
