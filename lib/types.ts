// API types

export interface Account {
  uuid: string;
  instagram_user_id: string | null;
  instagram_username: string | null;
  status: 'free' | 'paid';
  status_expires: string | null; // ISO 8601 datetime string
  date_created: string; // ISO 8601 datetime string
  date_updated: string; // ISO 8601 datetime string
}
