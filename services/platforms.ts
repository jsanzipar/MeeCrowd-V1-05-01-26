import { supabase } from '@/lib/supabase';
import type {
  PlatformAccount,
  PlatformMetrics,
  PlatformMetricsSnapshot,
  PlatformSummary,
  CrowdStats,
  Platform,
} from '@/types';

export const platformsService = {
  // ── Connected Accounts ──────────────────────────────────────────────

  async getMyAccounts(): Promise<PlatformAccount[]> {
    const { data, error } = await supabase
      .from('platform_accounts')
      .select('*')
      .order('connected_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async connectAccount(account: {
    platform: Platform;
    platform_user_id: string;
    platform_username: string;
    platform_avatar?: string;
    access_token: string;
    refresh_token?: string;
    token_expires_at?: string;
    scopes?: string[];
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('platform_accounts')
      .upsert(
        {
          user_id: user.id,
          ...account,
        },
        { onConflict: 'user_id,platform' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async disconnectAccount(platform: Platform) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('platform_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform);
    if (error) throw error;
  },

  // ── Metrics ─────────────────────────────────────────────────────────

  async getMetrics(userId: string): Promise<PlatformMetrics[]> {
    const { data, error } = await supabase
      .from('platform_metrics')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data ?? [];
  },

  async getMetricsHistory(
    platformAccountId: string,
    days = 30
  ): Promise<PlatformMetricsSnapshot[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('platform_metrics_history')
      .select('*')
      .eq('platform_account_id', platformAccountId)
      .gte('snapshot_date', since.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  // ── Crowd Stats (aggregated) ────────────────────────────────────────

  async getCrowdStats(userId: string): Promise<CrowdStats> {
    // Try materialized view first (fast)
    const { data, error } = await supabase
      .from('crowd_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      return {
        youtube: Number(data.youtube),
        twitch: Number(data.twitch),
        kick: Number(data.kick),
        instagram: Number(data.instagram),
        total: Number(data.total),
      };
    }

    // Fallback: compute from platform_metrics directly
    const metrics = await this.getMetrics(userId);
    const stats: CrowdStats = { youtube: 0, twitch: 0, kick: 0, instagram: 0, total: 0 };
    for (const m of metrics) {
      stats[m.platform] = m.follower_count;
      stats.total += m.follower_count;
    }
    return stats;
  },

  // ── Platform Summary (for profile display) ──────────────────────────

  async getUserPlatformSummaries(userId: string): Promise<PlatformSummary[]> {
    // Get accounts (we can see public info via a join or separate query)
    // Note: for other users we can't see tokens (RLS), but we need username + avatar
    // So we join via platform_metrics which is public
    const { data: metrics, error: mErr } = await supabase
      .from('platform_metrics')
      .select(`
        *,
        account:platform_accounts!platform_account_id (
          platform_username,
          platform_avatar,
          is_verified
        )
      `)
      .eq('user_id', userId);
    if (mErr) throw mErr;

    return (metrics ?? []).map((m: any) => ({
      platform: m.platform,
      username: m.account?.platform_username ?? '',
      avatar: m.account?.platform_avatar ?? null,
      is_verified: m.account?.is_verified ?? false,
      metrics: {
        id: m.id,
        platform_account_id: m.platform_account_id,
        user_id: m.user_id,
        platform: m.platform,
        follower_count: m.follower_count,
        following_count: m.following_count,
        total_view_count: m.total_view_count,
        total_like_count: m.total_like_count,
        total_comment_count: m.total_comment_count,
        media_count: m.media_count,
        paid_subscriber_count: m.paid_subscriber_count,
        extra_data: m.extra_data,
        fetched_at: m.fetched_at,
        created_at: m.created_at,
      },
    }));
  },

  // ── Upsert metrics (called after fetching from platform API) ────────

  async upsertMetrics(
    platformAccountId: string,
    platform: Platform,
    metrics: Omit<PlatformMetrics, 'id' | 'platform_account_id' | 'user_id' | 'platform' | 'created_at'>
  ) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Upsert current metrics
    const { error: upsertErr } = await supabase
      .from('platform_metrics')
      .upsert(
        {
          platform_account_id: platformAccountId,
          user_id: user.id,
          platform,
          ...metrics,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'platform_account_id' }
      );
    if (upsertErr) throw upsertErr;

    // Also write daily history snapshot (idempotent per day)
    const { error: histErr } = await supabase
      .from('platform_metrics_history')
      .upsert(
        {
          platform_account_id: platformAccountId,
          user_id: user.id,
          platform,
          snapshot_date: new Date().toISOString().split('T')[0],
          ...metrics,
        },
        { onConflict: 'platform_account_id,snapshot_date' }
      );
    if (histErr) throw histErr;
  },
};
