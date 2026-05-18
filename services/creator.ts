// Creator-sync service: links a MeeCrowd user to their YouTube/Kick channel
// via OAuth, surfaces their connection state, and triggers the back-catalog
// backfill via the sync-creator-content Edge Function.
//
// All token storage + handshakes happen server-side in Edge Functions
// (oauth-youtube-callback, oauth-kick-callback). This service is the
// thin app-side facade over those endpoints + the my_creator_connections
// view.

import { supabase } from '@/lib/supabase';
import type { Platform } from '@/types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

export interface CreatorConnection {
  id: string;
  user_id: string;
  platform_slug: string;
  platform_name: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  channel_external_id: string | null;
  internal_channel_id: string | null;
  scope: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Build the URL the app should open in a browser/webview to start OAuth.
 * Includes the MeeCrowd user_id so the callback can attribute the tokens
 * to the right account.
 *
 * `state` is generated server-side; the app doesn't need to know it.
 */
export function buildOAuthStartUrl(platform: 'youtube' | 'kick' | 'twitch' | 'instagram' | 'facebook' | 'tiktok', userId: string): string {
  const url = new URL(`${FUNCTIONS_BASE}/oauth-${platform}-start`);
  url.searchParams.set('user_id', userId);
  return url.toString();
}

export type ProfileFeedScope = 'public' | 'personal';

export interface CreatorPlatformStats {
  platform_slug: string;
  platform_name: string;
  channel_id: string;
  handle: string | null;
  channel_display_name: string | null;
  avatar_url: string | null;
  subscriber_count: number;
  video_count_remote: number;
  lifetime_view_count: number;
  synced_videos: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
}

export interface ProfileFeedItem {
  source: 'post' | 'external';
  id: string;
  owner_user_id: string;
  title: string | null;
  description: string | null;
  created_at: string;
  starts_at: string | null;
  visibility: string | null;
  platform_slug: string | null;
  platform_id: number | null;
  channel_id: string | null;
  embed_url: string | null;
  thumbnail_url: string | null;
  is_recurring: boolean;
  content_type: string;
}

export const creatorService = {
  /**
   * Connections the current user has authorized. Reads from a view that
   * exposes only safe metadata (not token values).
   */
  async getMyConnections(): Promise<CreatorConnection[]> {
    const { data, error } = await supabase
      .from('my_creator_connections')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CreatorConnection[];
  },

  /**
   * Trigger the back-catalog sync for an already-connected channel.
   * Idempotent — calls the sync-creator-content function, which upserts.
   * Resolves with whatever the function returns (counts of imported items).
   */
  async syncContent(platform: 'youtube' | 'kick' | 'twitch' | 'instagram' | 'facebook' | 'tiktok'): Promise<{
    ok: boolean;
    videos_synced?: number;
    duration_ms?: number;
    error?: string;
  }> {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${FUNCTIONS_BASE}/sync-creator-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ platform }),
    });
    return res.json();
  },

  /**
   * Per-platform stats for a creator's claimed channels. Powers both the
   * front-page subscriber summary and the Stats tab.
   *
   * Uses creator_profile_stats view (one row per platform).
   */
  async getCreatorStats(userId: string): Promise<CreatorPlatformStats[]> {
    const { data, error } = await supabase
      .from('creator_profile_stats')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    // Numerics arrive as strings from postgres-js — coerce.
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      subscriber_count: Number(r.subscriber_count ?? 0),
      video_count_remote: Number(r.video_count_remote ?? 0),
      lifetime_view_count: Number(r.lifetime_view_count ?? 0),
      synced_videos: Number(r.synced_videos ?? 0),
      total_views: Number(r.total_views ?? 0),
      total_likes: Number(r.total_likes ?? 0),
      total_comments: Number(r.total_comments ?? 0),
    })) as CreatorPlatformStats[];
  },

  /**
   * Unified profile feed (native posts + external content from claimed
   * channels). Scope decides which "tab" we're rendering:
   *   - 'public'   → all native posts + visibility='public' external content
   *   - 'personal' → ONLY visibility ∈ ('unlisted','private') external content
   *                  (caller must enforce that this is the profile owner)
   */
  async getProfileFeed(userId: string, scope: ProfileFeedScope): Promise<ProfileFeedItem[]> {
    let q = supabase
      .from('profile_feed')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (scope === 'public') {
      // Native posts have visibility=null (no concept). Include them OR
      // external rows where visibility='public'.
      q = q.or('visibility.is.null,visibility.eq.public');
    } else {
      q = q.in('visibility', ['unlisted', 'private']);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ProfileFeedItem[];
  },

  /**
   * Disconnect: removes the OAuth token and clears `user_id` from the
   * channel row (the channel goes back to being "discovered" content
   * rather than owned). The user's existing external_content rows stay
   * (with discovery_source='manual') so the public catalog doesn't vanish.
   */
  async disconnect(platform: Platform): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');

    const { data: platformRow } = await supabase
      .from('external_platforms')
      .select('id')
      .eq('slug', platform)
      .single();
    if (!platformRow) throw new Error(`Unknown platform ${platform}`);

    // 1) Delete the OAuth row (cascades nothing — channel rows reference
    //    user_id directly on external_channels).
    await supabase
      .from('user_oauth_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('platform_id', (platformRow as any).id);

    // 2) Unclaim any channels still pointing at this user on this platform.
    await supabase
      .from('external_channels')
      .update({ user_id: null, claimed_at: null })
      .eq('user_id', user.id)
      .eq('platform_id', (platformRow as any).id);
  },
};
