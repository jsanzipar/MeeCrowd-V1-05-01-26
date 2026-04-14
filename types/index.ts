export type Platform = 'youtube' | 'twitch' | 'kick' | 'instagram' | 'tiktok' | 'x' | 'facebook' | 'linkedin';

export type FeedTab = 'upcoming' | 'trending';

export type SortFilter =
  | 'following'
  | 'streamers'
  | 'youtube' | 'twitch' | 'kick' | 'instagram' | 'tiktok' | 'x' | 'facebook' | 'linkedin'
  | 'near-me'
  | 'location'
  | 'broadcasters'
  | 'gaming'
  | 'music'
  | 'sports'
  | 'education'
  | 'entertainment';

export type ContentType = 'post' | 'live' | 'scheduled' | 'clip';

export type EventStatus = 'live' | 'upcoming' | 'past' | 'recurring';

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
  tiktok: number;
  x: number;
  facebook: number;
  linkedin: number;
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

// ── Posts (events) ──────────────────────────────────────────────────────

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
  starts_at: string | null;
  ends_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
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

// ── Helpers ─────────────────────────────────────────────────────────────

export function getEventStatus(post: Post): EventStatus {
  if (post.is_recurring) return 'recurring';
  if (!post.starts_at) return 'past';

  const now = Date.now();
  const start = new Date(post.starts_at).getTime();
  const end = post.ends_at ? new Date(post.ends_at).getTime() : start + 3600000;

  if (now >= start && now <= end) return 'live';
  if (now < start) return 'upcoming';
  return 'past';
}

export function formatEventTime(post: Post): string {
  if (!post.starts_at) return '';
  const d = new Date(post.starts_at);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const mins = Math.floor(absDiff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (getEventStatus(post) === 'live') return 'LIVE NOW';

  if (diff > 0) {
    // Future
    if (mins < 60) return `in ${mins}m`;
    if (hrs < 24) return `in ${hrs}h`;
    if (days < 7) return `in ${days}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Past
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
