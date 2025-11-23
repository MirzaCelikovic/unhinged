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
  date_created: string; // ISO 8601 datetime string
  date_updated: string; // ISO 8601 datetime string
}

export interface Instagram {
  user_id: string;
  username: string;
}
