import { Instagram } from './types';

const INSTAGRAM_APP_ID = '936619743392459';

export async function fetchPublicProfile(username: string): Promise<Instagram> {
  const cleanUsername = username.toLowerCase().replace('@', '').trim();

  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${cleanUsername}`,
    {
      headers: {
        'X-IG-App-ID': INSTAGRAM_APP_ID,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('User not found');
    }
    throw new Error(`Failed to fetch profile: ${response.status}`);
  }

  const data = await response.json();

  if (!data.data?.user) {
    throw new Error('User not found');
  }

  const user = data.data.user;

  return {
    user_id: user.id,
    username: user.username,
    biography: user.biography || null,
    profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url || null,
    media_count: user.edge_owner_to_timeline_media?.count ?? null,
    followers_count: user.edge_followed_by?.count ?? null,
    following_count: user.edge_follow?.count ?? null,
  };
}
