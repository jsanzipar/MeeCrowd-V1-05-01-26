export type Platform = 'youtube' | 'twitch' | 'kick' | 'instagram';

export type FeedTab = 'for-you' | 'following' | 'featured';

export type ContentType = 'post' | 'live' | 'scheduled' | 'clip';

export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'featured' | 'platform_sync';

// ── User / Profile ──────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

// ── Platform Account (OAuth link) ───────────────────────────────────────

export interface PlatformAccount {
  id: string;
  user_id: string;
  platform: Platform;
  platform_user_id: string;
  platform_username: string;
  platform_avatar: string | null;
  access_token: string | null;    // only visible to owner (RLS)
  refresh_token: string | null;   // only visible to owner (RLS)
  token_expires_at: string | null;
  scopes: string[] | null;
  is_verified: boolean;
  connected_at: string;
  updated_at: string;
}

// ── Platform Metrics (current snapshot) ─────────────────────────────────

export interface PlatformMetrics {
  id: string;
  platform_account_id: string;
  user_id: string;
  platform: Platform;
  follower_count: number;
  following_count: number;
  total_view_count: number;
  total_like_count: number;
  total_comment_count: number;
  media_count: number;
  paid_subscriber_count: number;
  extra_data: Record<string, any>;
  fetched_at: string;
  created_at: string;
}

// ── Platform Metrics History (daily snapshots) ──────────────────────────

export interface PlatformMetricsSnapshot {
  id: string;
  platform_account_id: string;
  user_id: string;
  platform: Platform;
  snapshot_date: string;
  follower_count: number;
  following_count: number;
  total_view_count: number;
  total_like_count: number;
  total_comment_count: number;
  media_count: number;
  paid_subscriber_count: number;
  extra_data: Record<string, any>;
  created_at: string;
}

// ── Crowd Stats (aggregated view) ───────────────────────────────────────

export interface CrowdStats {
  youtube: number;
  twitch: number;
  kick: number;
  instagram: number;
  total: number;
}

// ── Aggregated metrics for a single platform (for UI display) ───────────

export interface PlatformSummary {
  platform: Platform;
  username: string;
  avatar: string | null;
  is_verified: boolean;
  metrics: PlatformMetrics | null;
}

// ── Posts ────────────────────────────────────────────────────────────────

export interface Post {
  id: string;
  user_id: string;
  platform: Platform;
  content_type: ContentType;
  title: string;
  body: string | null;
  thumbnail_url: string | null;
  external_url: string | null;
  like_count: number;
  comment_count: number;
  view_count: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  user?: User;
  is_liked?: boolean;
  is_bookmarked?: boolean;
}

// ── Comments ────────────────────────────────────────────────────────────

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  like_count: number;
  created_at: string;
  user?: User;
}

// ── Notifications ───────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string> | null;
  read_at: string | null;
  created_at: string;
  actor?: User;
}
