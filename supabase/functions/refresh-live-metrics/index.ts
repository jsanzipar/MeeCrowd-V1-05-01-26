// Supabase Edge Function — refresh-live-metrics
//
// Replaces the local supabase/refresh_live_metrics.mjs script. Ports the
// same logic to a hosted function and adds Kick support so a single cron
// schedule (every ~5 minutes) keeps viewer counts fresh AND cleans up
// expired streams across both platforms.
//
// Lifecycle for each is_live=true row:
//   * Still live  → INSERT a fresh row in external_content_metrics.
//   * Ended       → if discovery_source='live_trending' AND channel.user_id
//                   IS NULL → DELETE content (and orphan channel if no other
//                   content remains). Otherwise UPDATE is_live=false.
//
// Schedule (Supabase SQL Editor):
//   select cron.schedule(
//     'refresh-live-metrics',
//     '*/5 * * * *',
//     $$select net.http_post(
//        url := '<project>.supabase.co/functions/v1/refresh-live-metrics',
//        headers := jsonb_build_object('Content-Type','application/json'),
//        body := '{}'::jsonb
//      );$$
//   );

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const YT = 'https://www.googleapis.com/youtube/v3';
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';
const KICK_API = 'https://api.kick.com/public/v1';

interface LiveRow {
  id: string;
  external_id: string;
  title: string | null;
  content_discovery_source: string;
  channel_row_id: string;
  channel_discovery_source: string;
  channel_user_id: string | null;
}

async function getYoutubeApiKey(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('value, external_platforms!inner(slug)')
    .eq('credential_type', 'api_key')
    .eq('external_platforms.slug', 'youtube')
    .limit(1)
    .single();
  if (error) throw new Error(`YouTube key: ${error.message}`);
  return (data as any).value as string;
}

async function getKickToken(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('credential_type, value, external_platforms!inner(slug)')
    .in('credential_type', ['client_id', 'client_secret'])
    .eq('external_platforms.slug', 'kick');
  if (error || !data?.length) throw new Error(`Kick creds: ${error?.message}`);
  const map: Record<string, string> = {};
  for (const r of data as any[]) map[r.credential_type] = r.value;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: map.client_id,
    client_secret: map.client_secret,
  });
  const res = await fetch(KICK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Kick token ${res.status}`);
  const j = await res.json();
  return j.access_token as string;
}

/**
 * Apply the cleanup rule. Returns a label for logging.
 */
async function endStream(sb: SupabaseClient, row: LiveRow): Promise<string> {
  const isTempContent = row.content_discovery_source === 'live_trending';
  const isUnclaimedChannel = row.channel_user_id == null;

  if (isTempContent && isUnclaimedChannel) {
    await sb.from('external_content').delete().eq('id', row.id);

    if (row.channel_discovery_source === 'live_trending') {
      const { count } = await sb
        .from('external_content')
        .select('id', { count: 'exact', head: true })
        .eq('channel_id', row.channel_row_id);
      if (!count) {
        await sb.from('external_channels').delete().eq('id', row.channel_row_id);
        return 'deleted (content + channel)';
      }
    }
    return 'deleted (content only)';
  }

  await sb
    .from('external_content')
    .update({
      is_live: false,
      kind: 'video',
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  return 'marked past';
}

async function refreshYoutube(
  sb: SupabaseClient,
  rows: LiveRow[],
): Promise<{ refreshed: number; ended: number; deleted: number }> {
  if (!rows.length) return { refreshed: 0, ended: 0, deleted: 0 };

  const apiKey = await getYoutubeApiKey(sb);
  let refreshed = 0;
  let ended = 0;
  let deleted = 0;

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const ids = batch.map((r) => r.external_id);
    const url = new URL(`${YT}/videos`);
    url.searchParams.set('part', 'liveStreamingDetails,statistics,snippet');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      console.error('YT videos.list failed', res.status, await res.text().catch(() => ''));
      continue;
    }
    const json = await res.json();
    const items = (json.items as any[]) ?? [];
    const seen = new Set(items.map((v) => v.id));

    for (const v of items) {
      const row = batch.find((r) => r.external_id === v.id);
      if (!row) continue;
      const broadcast = v.snippet?.liveBroadcastContent;
      const stats = v.statistics ?? {};
      const live = v.liveStreamingDetails ?? null;
      if (broadcast === 'live') {
        await sb.from('external_content_metrics').insert({
          content_id: row.id,
          view_count: stats.viewCount ? Number(stats.viewCount) : null,
          like_count: stats.likeCount ? Number(stats.likeCount) : null,
          comment_count: stats.commentCount ? Number(stats.commentCount) : null,
          current_viewer_count: live?.concurrentViewers ? Number(live.concurrentViewers) : null,
          extra_data: { source: 'refresh_live_metrics' },
        });
        refreshed++;
      } else {
        const action = await endStream(sb, row);
        if (action.startsWith('deleted')) deleted++;
        else ended++;
      }
    }
    // Anything that didn't come back at all → unavailable / private now
    for (const row of batch) {
      if (seen.has(row.external_id)) continue;
      const action = await endStream(sb, row);
      if (action.startsWith('deleted')) deleted++;
      else ended++;
    }
  }
  return { refreshed, ended, deleted };
}

async function refreshKick(
  sb: SupabaseClient,
  rows: LiveRow[],
): Promise<{ refreshed: number; ended: number; deleted: number }> {
  if (!rows.length) return { refreshed: 0, ended: 0, deleted: 0 };

  const token = await getKickToken(sb);
  let refreshed = 0;
  let ended = 0;
  let deleted = 0;

  // Kick's /livestreams endpoint accepts up to 50 broadcaster_user_id per
  // call. Our LiveRow.external_id is channel_id (NOT broadcaster_user_id),
  // so we look up channels by channel_id batch via /channels — but its
  // filter is broadcaster_user_id too. Workaround: we stored
  // broadcaster_user_id in extra_data when we created the row. Read it.
  // Fallback: use the slug from extra_data if available.

  // Pull extra_data for these rows so we have broadcaster_user_id handy.
  const ids = rows.map((r) => r.id);
  const { data: contentRows } = await sb
    .from('external_content')
    .select('id, external_id, extra_data')
    .in('id', ids);
  const broadcasterByContentId = new Map<string, string>();
  for (const r of (contentRows as any[]) ?? []) {
    const buid = r.extra_data?.broadcaster_user_id;
    if (buid) broadcasterByContentId.set(r.id, String(buid));
  }

  // Group rows by broadcaster_user_id (string) for batched API calls.
  const broadcasterIds = Array.from(
    new Set(Array.from(broadcasterByContentId.values())),
  );

  // Hit /livestreams in batches of 50 broadcaster_user_id each. The
  // endpoint returns ONLY currently-live streams matching those IDs, so
  // any input id NOT in the response = stream ended.
  const liveByBroadcaster = new Map<string, any>();
  for (let i = 0; i < broadcasterIds.length; i += 50) {
    const batch = broadcasterIds.slice(i, i + 50);
    const url = new URL(`${KICK_API}/livestreams`);
    for (const id of batch) url.searchParams.append('broadcaster_user_id', id);
    url.searchParams.set('limit', '100');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error('Kick livestreams failed', res.status);
      continue;
    }
    const json = await res.json();
    for (const ls of (json.data as any[]) ?? []) {
      liveByBroadcaster.set(String(ls.broadcaster_user_id), ls);
    }
  }

  for (const row of rows) {
    const buid = broadcasterByContentId.get(row.id);
    if (!buid) {
      // Can't look this row up — skip; will retry next run when extra_data is fresh
      continue;
    }
    const ls = liveByBroadcaster.get(buid);
    if (ls) {
      await sb.from('external_content_metrics').insert({
        content_id: row.id,
        view_count: null,
        like_count: null,
        comment_count: null,
        current_viewer_count: ls.viewer_count ?? null,
        extra_data: { source: 'refresh_live_metrics' },
      });
      refreshed++;
    } else {
      const action = await endStream(sb, row);
      if (action.startsWith('deleted')) deleted++;
      else ended++;
    }
  }
  return { refreshed, ended, deleted };
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pull all live content + channel info needed for cleanup decisions.
    const { data: liveData, error } = await sb
      .from('external_content')
      .select(
        `id, external_id, title, discovery_source,
         channel_id,
         channel:external_channels!inner(id, discovery_source, user_id, platform:external_platforms!inner(slug))`,
      )
      .eq('is_live', true);
    if (error) throw new Error(`Could not load live content: ${error.message}`);

    const youtube: LiveRow[] = [];
    const kick: LiveRow[] = [];
    for (const r of (liveData as any[]) ?? []) {
      const row: LiveRow = {
        id: r.id,
        external_id: r.external_id,
        title: r.title,
        content_discovery_source: r.discovery_source,
        channel_row_id: r.channel.id,
        channel_discovery_source: r.channel.discovery_source,
        channel_user_id: r.channel.user_id,
      };
      const slug = r.channel.platform?.slug;
      if (slug === 'youtube') youtube.push(row);
      else if (slug === 'kick') kick.push(row);
    }

    const [yt, kk] = await Promise.all([
      refreshYoutube(sb, youtube),
      refreshKick(sb, kick),
    ]);

    return Response.json({
      ok: true,
      youtube: { ...yt, total: youtube.length },
      kick: { ...kk, total: kick.length },
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('refresh-live-metrics failed:', e);
    return Response.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
});
