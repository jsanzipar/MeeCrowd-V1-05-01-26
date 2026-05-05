// Read-only data access for external aggregation (YouTube/Twitch/Kick).
// All ingest happens server-side; this service only SELECTs.
import { supabase } from '@/lib/supabase';
import type {
  ExternalChannel,
  ExternalContent,
  ExternalComment,
  ExternalLiveNowRow,
  ExternalContentMetrics,
} from '@/types';

const CHANNEL_SELECT = `
  *,
  platform:external_platforms!platform_id (*)
`;

const CONTENT_SELECT = `
  *,
  channel:external_channels!channel_id (*, platform:external_platforms!platform_id (*)),
  platform:external_platforms!platform_id (*)
`;

export const aggregationService = {
  /**
   * Currently-live streams across all platforms, ordered by viewer count.
   * Reads from the external_live_now view.
   *
   * The default 300 rows is much larger than the Trending feed actually
   * shows — but the client needs enough headroom to do per-platform fair
   * distribution (otherwise smaller platforms like Twitch get squeezed
   * out by a handful of YouTube/Kick mega-streams).
   */
  async getLiveNow(limit = 300): Promise<ExternalLiveNowRow[]> {
    const { data, error } = await supabase
      .from('external_live_now')
      .select('*')
      .order('current_viewer_count', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /** Paginated list of all aggregated channels, biggest first. */
  async listChannels(limit = 50, offset = 0): Promise<ExternalChannel[]> {
    const { data, error } = await supabase
      .from('external_channels')
      .select(CHANNEL_SELECT)
      .order('subscriber_count', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data ?? []) as ExternalChannel[];
  },

  async getChannel(channelId: string): Promise<ExternalChannel | null> {
    const { data, error } = await supabase
      .from('external_channels')
      .select(CHANNEL_SELECT)
      .eq('id', channelId)
      .maybeSingle();
    if (error) throw error;
    return (data as ExternalChannel) ?? null;
  },

  /**
   * Recent content for a channel. We fetch latest metrics in a second
   * query and join client-side — keeps the SQL simple and matches what
   * PostgREST can express without RPC.
   */
  async getChannelContent(
    channelId: string,
    limit = 20
  ): Promise<ExternalContent[]> {
    const { data, error } = await supabase
      .from('external_content')
      .select(CONTENT_SELECT)
      .eq('channel_id', channelId)
      .order('is_live', { ascending: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    const items = (data ?? []) as ExternalContent[];
    if (!items.length) return items;

    const metrics = await fetchLatestMetricsBulk(items.map((i) => i.id));
    return items.map((item) => ({
      ...item,
      latest_metrics: metrics.get(item.id) ?? null,
    }));
  },

  async getContent(contentId: string): Promise<ExternalContent | null> {
    const { data, error } = await supabase
      .from('external_content')
      .select(CONTENT_SELECT)
      .eq('id', contentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const item = data as ExternalContent;
    const metrics = await fetchLatestMetricsBulk([item.id]);
    return { ...item, latest_metrics: metrics.get(item.id) ?? null };
  },

  async getContentComments(
    contentId: string,
    limit = 20
  ): Promise<ExternalComment[]> {
    const { data, error } = await supabase
      .from('external_comments')
      .select('*')
      .eq('content_id', contentId)
      .order('like_count', { ascending: false })
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

/**
 * For a list of content IDs, return the most recent metrics row for each.
 * One round-trip; ordering done client-side.
 */
async function fetchLatestMetricsBulk(
  contentIds: string[]
): Promise<Map<string, ExternalContentMetrics>> {
  const out = new Map<string, ExternalContentMetrics>();
  if (!contentIds.length) return out;

  // Pull recent metrics for the set, then keep the newest per content_id.
  // We over-fetch (5 per content) to ensure we hit at least one per id even
  // with concurrent ingest writes.
  const { data, error } = await supabase
    .from('external_content_metrics')
    .select('*')
    .in('content_id', contentIds)
    .order('snapshot_at', { ascending: false })
    .limit(contentIds.length * 5);
  if (error) throw error;

  for (const row of (data ?? []) as ExternalContentMetrics[]) {
    if (!out.has(row.content_id)) out.set(row.content_id, row);
  }
  return out;
}
