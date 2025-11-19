import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useApi } from './api';
import { Instagram } from './types';

// Fetch tracked accounts
const fetchTracks = async (
  api: ReturnType<typeof useApi>,
  accountId: string
): Promise<Instagram[]> => {
  try {
    const { data } = await api.get(`/api/v1/account/${accountId}/tracks/`);
    return data;
  } catch (error) {
    console.error('Error fetching tracks:', error);
    throw error;
  }
};

// Start tracking an account
const addTrack = async (
  api: ReturnType<typeof useApi>,
  accountId: string,
  userId: string,
  username: string
): Promise<void> => {
  try {
    await api.post(`/api/v1/account/${accountId}/tracks/`, {
      user_id: userId,
      username: username,
    });
  } catch (error) {
    console.error('Error adding track:', error);
    throw error;
  }
};

// Stop tracking an account
const removeTrack = async (
  api: ReturnType<typeof useApi>,
  accountId: string,
  userId: string
): Promise<void> => {
  try {
    await api.delete(`/api/v1/account/${accountId}/tracks/${userId}/`);
  } catch (error) {
    console.error('Error removing track:', error);
    throw error;
  }
};

// Hook to fetch tracked accounts
export const useTracks = (accountId: string | null) => {
  const api = useApi();
  return useQuery<Instagram[]>({
    queryKey: ['tracks', accountId],
    queryFn: () => fetchTracks(api, accountId!),
    enabled: !!accountId,
  });
};

// Hook to add a tracked account
export const useAddTrack = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { accountId: string; userId: string; username: string }>({
    mutationFn: ({ accountId, userId, username }) => addTrack(api, accountId, userId, username),
    onSuccess: (_, variables) => {
      console.log('Track added successfully');
      queryClient.invalidateQueries({ queryKey: ['tracks', variables.accountId] });
    },
    onError: (error: AxiosError) => {
      console.error('Add track failed:', error);
      throw error;
    },
  });
};

// Hook to remove a tracked account
export const useRemoveTrack = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { accountId: string; userId: string }>({
    mutationFn: ({ accountId, userId }) => removeTrack(api, accountId, userId),
    onSuccess: (_, variables) => {
      console.log('Track removed successfully');
      queryClient.invalidateQueries({ queryKey: ['tracks', variables.accountId] });
    },
    onError: (error: AxiosError) => {
      console.error('Remove track failed:', error);
      throw error;
    },
  });
};
