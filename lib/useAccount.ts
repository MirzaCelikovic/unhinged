import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useApi } from './api';
import { Account } from './types';

// Fetch account by UUID
const fetchAccount = async (api: ReturnType<typeof useApi>, uuid: string): Promise<Account> => {
  try {
    const { data } = await api.get(`/api/v1/account/${uuid}/`);
    return data;
  } catch (error) {
    console.error('Error fetching account:', error);
    throw error;
  }
};

// Create new account
const createAccount = async (api: ReturnType<typeof useApi>): Promise<Account> => {
  try {
    const { data } = await api.post('/api/v1/account/');
    return data;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
};

// Update account
const updateAccount = async (
  api: ReturnType<typeof useApi>,
  uuid: string,
  updates: Partial<Account>
): Promise<Account> => {
  try {
    const { data } = await api.patch(`/api/v1/account/${uuid}/`, updates);
    return data;
  } catch (error) {
    console.error('Error updating account:', error);
    throw error;
  }
};

// Connect Instagram account
const connectInstagram = async (
  api: ReturnType<typeof useApi>,
  uuid: string,
  userId: string,
  username: string
): Promise<void> => {
  try {
    await api.post(`/api/v1/account/${uuid}/instagram/`, {
      user_id: userId,
      username: username,
    });
  } catch (error) {
    console.error('Error connecting Instagram:', error);
    throw error;
  }
};

// Disconnect Instagram account
const disconnectInstagram = async (api: ReturnType<typeof useApi>, uuid: string): Promise<void> => {
  try {
    await api.delete(`/api/v1/account/${uuid}/instagram/`);
  } catch (error) {
    console.error('Error disconnecting Instagram:', error);
    throw error;
  }
};

// Hook to fetch account by UUID
export const useAccount = (uuid: string | null) => {
  const api = useApi();
  return useQuery<Account>({
    queryKey: ['account', uuid],
    queryFn: () => fetchAccount(api, uuid!),
    enabled: !!uuid, // Only run query if uuid exists
  });
};

// Hook to create new account
export const useCreateAccount = () => {
  const api = useApi();
  return useMutation<Account, AxiosError>({
    mutationFn: () => createAccount(api),
    onError: (error: AxiosError) => {
      console.error('Account creation failed:', error);
      throw error;
    },
  });
};

// Hook to update account
export const useUpdateAccount = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<Account, AxiosError, { uuid: string; updates: Partial<Account> }>({
    mutationFn: ({ uuid, updates }) => updateAccount(api, uuid, updates),
    onSuccess: (data) => {
      console.log('Account updated successfully:', data);
      queryClient.invalidateQueries({ queryKey: ['account', data.uuid] });
    },
    onError: (error: AxiosError) => {
      console.error('Account update failed:', error);
      throw error;
    },
  });
};

// Hook to connect Instagram
export const useConnectInstagram = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { uuid: string; userId: string; username: string }>({
    mutationFn: ({ uuid, userId, username }) => connectInstagram(api, uuid, userId, username),
    onSuccess: (_, variables) => {
      console.log('Instagram connected successfully');
      queryClient.invalidateQueries({ queryKey: ['account', variables.uuid] });
    },
    onError: (error: AxiosError) => {
      console.error('Instagram connection failed:', error);
      throw error;
    },
  });
};

// Hook to disconnect Instagram
export const useDisconnectInstagram = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { uuid: string }>({
    mutationFn: ({ uuid }) => disconnectInstagram(api, uuid),
    onSuccess: (_, variables) => {
      console.log('Instagram disconnected successfully');
      queryClient.invalidateQueries({ queryKey: ['account', variables.uuid] });
    },
    onError: (error: AxiosError) => {
      console.error('Instagram disconnection failed:', error);
      throw error;
    },
  });
};
