import * as SecureStore from 'expo-secure-store';

export interface SecureStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export function useSecureStorage(): SecureStorage {
  const getItem = async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  };

  const setItem = async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      throw error;
    }
  };

  const removeItem = async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`Error removing item ${key}:`, error);
      throw error;
    }
  };

  return { getItem, setItem, removeItem };
}
