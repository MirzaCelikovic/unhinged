// API types

export interface Account {
  uuid: string;
  instagram_user_id: string | null;
  instagram_username: string | null;
  status: 'free' | 'paid';
  status_expires: string | null; // ISO 8601 datetime string
  notification_account: boolean;
  notification_tracked: boolean;
  notification_marketing: boolean;
  latest_activity_date: string | null; // ISO 8601 datetime string (UTC)
  date_created: string; // ISO 8601 datetime string
  date_updated: string; // ISO 8601 datetime string
}

export interface Instagram {
  user_id: string;
  username: string;
  full_name?: string | null;
  profile_pic_url?: string | null;
  biography?: string | null;
  media_count?: number | null;
  following_count?: number;
  followers_count?: number;
  date_created?: string;
  date_updated?: string;
}
