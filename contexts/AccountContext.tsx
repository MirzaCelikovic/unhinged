import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAccount, useCreateAccount } from '~/lib/useAccount';
import { useSecureStorage } from '~/lib/useSecureStorage';
import { Account } from '~/lib/types';

const ACCOUNT_ID_KEY = 'account_id';

interface AccountContextType {
  account: Account | null;
  isLoading: boolean;
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

  // Create new account mutation
  const createAccount = useCreateAccount();

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
    isCheckingStorage || isFetchingAccount || createAccount.isPending;

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
    isLoading,
  };

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};
