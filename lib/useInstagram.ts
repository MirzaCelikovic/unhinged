import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';
import { AxiosError } from 'axios';
import { useApi } from './api';
import { Instagram } from './types';

// Fetch tracked accounts from API
const fetchTrackedInstagrams = async (
  api: ReturnType<typeof useApi>,
  accountId: string
): Promise<Instagram[]> => {
  try {
    const { data } = await api.get(`/api/v1/account/${accountId}/tracks/`);
    return data;
  } catch (error) {
    console.error('Error fetching tracked instagrams:', error);
    throw error;
  }
};

// Add tracked account to API
const addTrackedInstagram = async (
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
    console.error('Error adding tracked instagram:', error);
    throw error;
  }
};

// Remove tracked account from API
const removeTrackedInstagram = async (
  api: ReturnType<typeof useApi>,
  accountId: string,
  userId: string
): Promise<void> => {
  try {
    await api.delete(`/api/v1/account/${accountId}/tracks/${userId}/`);
  } catch (error) {
    console.error('Error removing tracked instagram:', error);
    throw error;
  }
};

// Fetch local Instagram data from SQLite using user IDs
const fetchInstagramsData = async (db: any, userIds: string[]): Promise<Map<string, Instagram>> => {
  if (userIds.length === 0) {
    return new Map();
  }

  try {
    // Build placeholders for SQL IN clause
    const placeholders = userIds.map(() => '?').join(',');

    // Fetch all Instagram data in a single query
    const instagrams = await db.getAllAsync<Instagram>(
      `SELECT
        user_id,
        username,
        full_name,
        biography,
        profile_pic_url,
        media_count,
        followers_count,
        following_count,
        date_created,
        date_updated
      FROM instagrams
      WHERE user_id IN (${placeholders})`,
      userIds
    );

    // Convert array to Map for efficient lookup
    const dataMap = new Map<string, Instagram>();
    instagrams.forEach((instagram) => {
      dataMap.set(instagram.user_id, instagram);
    });

    return dataMap;
  } catch (error) {
    console.error('Error fetching instagrams data from SQLite:', error);
    throw error;
  }
};

// Hook to fetch a single Instagram account by userId
export const useInstagram = (userId: string | null) => {
  const db = useSQLiteContext();

  return useQuery<Instagram | null>({
    queryKey: ['instagram', userId],
    queryFn: async () => {
      if (!userId) return null;

      const instagram = await db.getFirstAsync<Instagram>(
        `SELECT
          user_id,
          username,
          biography,
          profile_pic_url,
          media_count,
          followers_count,
          following_count,
          date_created,
          date_updated
        FROM instagrams
        WHERE user_id = ?`,
        [userId]
      );

      return instagram || null;
    },
    enabled: !!userId,
    initialData: null,
  });
};

// Hook to fetch tracked Instagram accounts with local data
export const useTrackedInstagrams = (accountId: string | null) => {
  const api = useApi();
  const db = useSQLiteContext();

  return useQuery<Instagram[]>({
    queryKey: ['trackedInstagrams', accountId],
    queryFn: async () => {
      // Step 1: Fetch tracked accounts from API
      const tracks = await fetchTrackedInstagrams(api, accountId!);

      // Step 2: Fetch local Instagram data for each tracked account
      const userIds = tracks.map((track) => track.user_id);
      const instagramsData = await fetchInstagramsData(db, userIds);

      // Step 3: Enrich tracks with local data
      const enrichedTracks = tracks.map((track) => {
        const localData = instagramsData.get(track.user_id);
        return {
          ...track,
          ...localData, // Merge local data (profile_pic_url, biography, media_count, etc.)
        };
      });

      return enrichedTracks;
    },
    enabled: !!accountId,
  });
};

// Hook to add a tracked Instagram account
export const useAddTrackedInstagram = () => {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { accountId: string; userId: string; username: string }>({
    mutationFn: ({ accountId, userId, username }) =>
      addTrackedInstagram(api, accountId, userId, username),
    onSuccess: (_, variables) => {
      console.log('Tracked instagram added successfully');
      // Invalidate the tracked instagrams cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['trackedInstagrams', variables.accountId] });
    },
    onError: (error: AxiosError) => {
      console.error('Add tracked instagram failed:', error);
      throw error;
    },
  });
};

// Hook to remove a tracked Instagram account
export const useRemoveTrackedInstagram = () => {
  const api = useApi();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { accountId: string; userId: string }>({
    mutationFn: async ({ accountId, userId }) => {
      // Remove from API
      await removeTrackedInstagram(api, accountId, userId);

      // Clean up local data for this tracked account
      console.log(`Cleaning up local data for ${userId}`);
      await db.runAsync('DELETE FROM followings WHERE tracked_account_id = ?', [userId]);
      await db.runAsync('DELETE FROM followers WHERE tracked_account_id = ?', [userId]);
      await db.runAsync('DELETE FROM sync_state WHERE instagram_user_id = ?', [userId]);
      // Note: Keep instagrams table - it's shared across all tracked accounts and contains user profiles
      console.log(`Local data cleaned up for ${userId}`);
    },
    onSuccess: (_, variables) => {
      console.log('Tracked instagram removed successfully');
      // Invalidate the tracked instagrams cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['trackedInstagrams', variables.accountId] });
      // Invalidate activity cache since data was deleted
      queryClient.invalidateQueries({ queryKey: ['instagramActivity', variables.userId] });
    },
    onError: (error: AxiosError) => {
      console.error('Remove tracked instagram failed:', error);
      throw error;
    },
  });
};
