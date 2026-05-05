// Supabase Edge Function — discover-live-twitch
//
// Pulls the top currently-live Twitch streams (English + Spanish) and
// ingests them as auto-discovered channels + content rows. Mirrors
// discover-live-kick / discover-live-youtube.
//
// Auth: client_credentials grant against id.twitch.tv, plus the required
// Client-Id header on every Helix call.
//
// Quota: Twitch's Helix rate limit is 800 points/min for app tokens — we
// use ~5 points per run so headroom is enormous.
//
// Schedule (Supabase SQL Editor):
//   select cron.schedule(
//     'discover-live-twitch-hourly',
//     '10 * * * *',     -- 10 minutes past the hour, offset from YT/Kick
//     $$select net.http_post(
//        url := '<project>.supabase.co/functions/v1/discover-live-twitch',
//        headers := jsonb_build_object('Content-Type','application/json'),
//        body := '{}'::jsonb
//      );$$
//   );

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_API = 'https://api.twitch.tv/helix';

const TARGET_LANGUAGES = ['en', 'es'];
const PER_LANGUAGE_LIMIT = 50;

interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tags?: string[];
  is_mature: boolean;
}

interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  description?: string;
  profile_image_url?: string;
  offline_image_url?: string;
  broadcaster_type?: string;
  view_count?: number;
  created_at?: string;
}

/** Twitch returns thumbnails with `{width}x{height}` placeholders. */
function expandThumbnail(url: string, width = 480, height = 270): string {
  return url.replace('{width}', String(width)).replace('{height}', String(height));
}

async function getCredentials(
  sb: SupabaseClient,
): Promise<{ client_id: string; client_secret: string }> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('credential_type, value, external_platforms!inner(slug)')
    .in('credential_type', ['client_id', 'client_secret'])
    .eq('external_platforms.slug', 'twitch');
  if (error || !data?.length) throw new Error('Twitch credentials not found');
  const map: Record<string, string> = {};
  for (const row of data as any[]) map[row.credential_type] = row.value;
  if (!map.client_id || !map.client_secret) throw new Error('Incomplete Twitch creds');
  return { client_id: map.client_id, client_secret: map.client_secret };
}

async function getPlatformId(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb
    .from('external_platforms')
    .select('id')
    .eq('slug', 'twitch')
    .single();
  if (error) throw new Error(`No twitch platform: ${error.message}`);
  return (data as any).id as number;
}

async function getAppToken(creds: { client_id: string; client_secret: string }): Promise<string> {
  const res = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Twitch token ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  if (!j.access_token) throw new Error(`No access_token: ${JSON.stringify(j)}`);
  return j.access_token as string;
}

async function helixGet(
  path: string,
  params: Record<string, string | string[]>,
  token: string,
  clientId: string,
): Promise<any> {
  const url = new URL(`${TWITCH_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Twitch ${path} ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function upsertChannel(
  sb: SupabaseClient,
  platformId: number,
  user: TwitchUser,
  fallbackName: string,
): Promise<string | null> {
  const fields = {
    platform_id: platformId,
    platform_external_id: user.id,
    handle: user.login,
    display_name: user.display_name ?? fallbackName,
    avatar_url: user.profile_image_url ?? null,
    banner_url: user.offline_image_url ?? null,
    description: user.description ?? null,
    channel_url: `https://www.twitch.tv/${user.login}`,
    country: null as string | null,
    subscriber_count: 0, // followers fetched separately if needed; leave 0 for discovery
    total_view_count: user.view_count != null ? String(user.view_count) : '0',
    video_count: 0,
    extra_data: { broadcaster_type: user.broadcaster_type ?? null },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_channels')
    .select('id')
    .eq('platform_id', platformId)
    .eq('platform_external_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('external_channels')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) {
      console.error(`channel update ${user.login}:`, error.message);
      return null;
    }
    return (existing as any).id;
  }

  const { data: inserted, error } = await sb
    .from('external_channels')
    .insert({ ...fields, discovery_source: 'live_trending' })
    .select('id')
    .single();
  if (error) {
    console.error(`channel insert ${user.login}:`, error.message);
    return null;
  }
  return (inserted as any).id;
}

async function upsertContent(
  sb: SupabaseClient,
  platformId: number,
  channelRowId: string,
  s: TwitchStream,
): Promise<string | null> {
  const fields = {
    channel_id: channelRowId,
    platform_id: platformId,
    external_id: s.id, // Twitch streams have a stable id
    kind: 'live' as const,
    title: s.title ?? null,
    description: null,
    url: `https://www.twitch.tv/${s.user_login}`,
    embed_url: `https://player.twitch.tv/?channel=${s.user_login}&parent=meecrowd.com`,
    thumbnail_url: expandThumbnail(s.thumbnail_url, 480, 270),
    duration_seconds: null,
    is_live: true,
    language: s.language ?? null,
    category: s.game_name ?? null,
    published_at: s.started_at ?? null,
    scheduled_start_at: null,
    extra_data: {
      user_login: s.user_login,
      user_id: s.user_id,
      game_id: s.game_id,
      tags: s.tags ?? [],
      isMature: s.is_mature,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', platformId)
    .eq('external_id', s.id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb.from('external_content').update(fields).eq('id', (existing as any).id);
    if (error) {
      console.error(`content update ${s.id}:`, error.message);
      return null;
    }
    return (existing as any).id;
  }

  const { data: inserted, error } = await sb
    .from('external_content')
    .insert({ ...fields, discovery_source: 'live_trending' })
    .select('id')
    .single();
  if (error) {
    console.error(`content insert ${s.id}:`, error.message);
    return null;
  }
  return (inserted as any).id;
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const platformId = await getPlatformId(sb);
    const creds = await getCredentials(sb);
    const token = await getAppToken(creds);

    // 1) Pull top live streams per target language (one Helix call each).
    const streamResponses = await Promise.all(
      TARGET_LANGUAGES.map((lang) =>
        helixGet(
          '/streams',
          { first: String(PER_LANGUAGE_LIMIT), language: lang },
          token,
          creds.client_id,
        ),
      ),
    );

    // Merge + dedupe by stream id (uniqueness is per broadcast).
    const streamsById = new Map<string, TwitchStream>();
    for (const r of streamResponses) {
      for (const s of (r.data as TwitchStream[]) ?? []) {
        streamsById.set(s.id, s);
      }
    }
    const streams = Array.from(streamsById.values());
    if (streams.length === 0) {
      return Response.json({ ok: true, discovered: 0 });
    }

    // 2) Fetch user metadata in batches of up to 100 user_ids each.
    const userIds = Array.from(new Set(streams.map((s) => s.user_id)));
    const userById = new Map<string, TwitchUser>();
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const resp = await helixGet('/users', { id: batch }, token, creds.client_id);
      for (const u of (resp.data as TwitchUser[]) ?? []) userById.set(u.id, u);
    }

    // 3) Upsert channels.
    const channelRowIds = new Map<string, string>();
    for (const s of streams) {
      const user = userById.get(s.user_id);
      if (!user) continue;
      const id = await upsertChannel(sb, platformId, user, s.user_name);
      if (id) channelRowIds.set(s.user_id, id);
    }

    // 4) Upsert content + insert metrics.
    let processed = 0;
    for (const s of streams) {
      const channelRowId = channelRowIds.get(s.user_id);
      if (!channelRowId) continue;
      const contentId = await upsertContent(sb, platformId, channelRowId, s);
      if (!contentId) continue;
      await sb.from('external_content_metrics').insert({
        content_id: contentId,
        view_count: null,
        like_count: null,
        comment_count: null,
        current_viewer_count: s.viewer_count ?? null,
        extra_data: { source: 'discover_live_twitch' },
      });
      processed++;
    }

    return Response.json({
      ok: true,
      languages: TARGET_LANGUAGES,
      unique_streams: streams.length,
      unique_channels: userById.size,
      processed,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('discover-live-twitch failed:', e);
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
});
