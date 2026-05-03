// Supabase Edge Function — discover-live-kick
//
// Pulls the top currently-live Kick streams (English + Spanish) and ingests
// them as auto-discovered channels + content rows. Mirrors discover-live-youtube
// in shape, with a few Kick-specific differences:
//
//   * Auth: OAuth 2.1 client_credentials grant against id.kick.com.
//     Tokens last ~60 days, so we just request a fresh one each run rather
//     than caching (negligible cost vs. complexity).
//
//   * No `q` hack needed: Kick's /livestreams endpoint sorts by viewer_count
//     by default and supports a real `language` filter parameter.
//
//   * external_id: Kick livestreams have no per-broadcast ID — only a stable
//     channel_id and broadcaster_user_id. We use String(channel_id) so each
//     channel maps to ONE content row regardless of how many times they've
//     gone live. The cleanup worker deletes the row when the stream ends.
//
// Schedule (Supabase SQL Editor):
//   select cron.schedule(
//     'discover-live-kick-hourly',
//     '5 * * * *',     -- 5 minutes past the hour, offset from YouTube
//     $$select net.http_post(
//        url := '<project>.supabase.co/functions/v1/discover-live-kick',
//        headers := jsonb_build_object('Content-Type','application/json'),
//        body := '{}'::jsonb
//      );$$
//   );
//
// Deploy:
//   npx supabase functions deploy discover-live-kick

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';
const KICK_API = 'https://api.kick.com/public/v1';

const TARGET_LANGUAGES = ['en', 'es']; // English + Spanish, mirroring YouTube
const PER_LANGUAGE_LIMIT = 50;

interface KickLivestream {
  broadcaster_user_id: number;
  channel_id: number;
  slug: string;
  stream_title: string;
  language: string;
  has_mature_content: boolean;
  viewer_count: number;
  thumbnail: string;
  started_at: string;
  category?: { id?: number; name?: string; thumbnail?: string };
  profile_picture?: string;
}

interface KickChannel {
  broadcaster_user_id: number;
  slug: string;
  stream_title?: string;
  channel_description?: string;
  banner_picture?: string;
  active_subscribers_count?: number;
  category?: { id?: number; name?: string; thumbnail?: string };
  stream?: {
    is_live?: boolean;
    is_mature?: boolean;
    language?: string;
    start_time?: string;
    thumbnail?: string;
    url?: string;
    viewer_count?: number;
  };
}

async function getCredentials(
  sb: SupabaseClient,
): Promise<{ client_id: string; client_secret: string }> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('credential_type, value, external_platforms!inner(slug)')
    .in('credential_type', ['client_id', 'client_secret'])
    .eq('external_platforms.slug', 'kick');
  if (error || !data?.length) throw new Error('Kick credentials not found');
  const map: Record<string, string> = {};
  for (const row of data as any[]) map[row.credential_type] = row.value;
  if (!map.client_id || !map.client_secret) throw new Error('Incomplete Kick creds');
  return { client_id: map.client_id, client_secret: map.client_secret };
}

async function getPlatformId(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb
    .from('external_platforms')
    .select('id')
    .eq('slug', 'kick')
    .single();
  if (error) throw new Error(`No kick platform: ${error.message}`);
  return (data as any).id as number;
}

async function getAccessToken(creds: {
  client_id: string;
  client_secret: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.client_id,
    client_secret: creds.client_secret,
  });
  const res = await fetch(KICK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kick token ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  if (!j.access_token) throw new Error(`No access_token in response: ${JSON.stringify(j)}`);
  return j.access_token as string;
}

async function kickGet(
  path: string,
  params: Record<string, string | string[]>,
  token: string,
): Promise<any> {
  const url = new URL(`${KICK_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      // Kick repeats the same key for array params
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Kick ${path} ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Insert-or-update a channel without overwriting discovery_source on
 * existing rows (so manually-added/user-claimed channels stay 'manual').
 */
async function upsertChannel(
  sb: SupabaseClient,
  platformId: number,
  ch: {
    broadcaster_user_id: number;
    slug: string;
    display_name: string;
    avatar_url: string | null;
    description: string | null;
    banner_url: string | null;
    subscriber_count: number;
    language: string | null;
  },
): Promise<string | null> {
  const fields = {
    platform_id: platformId,
    platform_external_id: String(ch.broadcaster_user_id),
    handle: ch.slug,
    display_name: ch.display_name,
    avatar_url: ch.avatar_url,
    banner_url: ch.banner_url,
    description: ch.description,
    channel_url: `https://kick.com/${ch.slug}`,
    country: null as string | null,
    language: ch.language,
    subscriber_count: ch.subscriber_count,
    total_view_count: '0',
    video_count: 0,
    extra_data: { source: 'discover_live_kick' },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_channels')
    .select('id')
    .eq('platform_id', platformId)
    .eq('platform_external_id', String(ch.broadcaster_user_id))
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('external_channels')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) {
      console.error(`channel update ${ch.slug}:`, error.message);
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
    console.error(`channel insert ${ch.slug}:`, error.message);
    return null;
  }
  return (inserted as any).id;
}

async function upsertContent(
  sb: SupabaseClient,
  platformId: number,
  channelRowId: string,
  ls: KickLivestream,
): Promise<string | null> {
  const fields = {
    channel_id: channelRowId,
    platform_id: platformId,
    external_id: String(ls.channel_id),
    kind: 'live' as const,
    title: ls.stream_title ?? null,
    description: null,
    url: `https://kick.com/${ls.slug}`,
    embed_url: `https://player.kick.com/${ls.slug}`,
    thumbnail_url: ls.thumbnail ?? null,
    duration_seconds: null,
    is_live: true,
    language: ls.language ?? null,
    category: ls.category?.name ?? null,
    published_at: ls.started_at ?? null,
    scheduled_start_at: null,
    extra_data: {
      slug: ls.slug,
      hasMatureContent: ls.has_mature_content,
      categoryId: ls.category?.id,
      broadcaster_user_id: ls.broadcaster_user_id,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', platformId)
    .eq('external_id', String(ls.channel_id))
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('external_content')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) {
      console.error(`content update ${ls.slug}:`, error.message);
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
    console.error(`content insert ${ls.slug}:`, error.message);
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
    const token = await getAccessToken(creds);

    // 1) Pull top live streams per target language in parallel.
    const lsResponses = await Promise.all(
      TARGET_LANGUAGES.map((lang) =>
        kickGet(
          '/livestreams',
          {
            sort: 'viewer_count',
            language: lang,
            limit: String(PER_LANGUAGE_LIMIT),
          },
          token,
        ),
      ),
    );

    // Merge and dedupe by channel_id (one entry per channel max).
    const livestreamsByChannelId = new Map<number, KickLivestream>();
    for (const r of lsResponses) {
      for (const ls of (r.data as KickLivestream[]) ?? []) {
        // Keep the higher viewer_count if duplicate (shouldn't happen but be safe).
        const existing = livestreamsByChannelId.get(ls.channel_id);
        if (!existing || (ls.viewer_count ?? 0) > (existing.viewer_count ?? 0)) {
          livestreamsByChannelId.set(ls.channel_id, ls);
        }
      }
    }
    const livestreams = Array.from(livestreamsByChannelId.values());

    if (livestreams.length === 0) {
      return Response.json({ ok: true, discovered: 0, note: 'no live streams returned' });
    }

    // 2) Fetch richer channel data (description, banner, sub count) in
    //    batches of up to 50 broadcaster_user_ids per call.
    const broadcasterIds = livestreams.map((ls) => String(ls.broadcaster_user_id));
    const channelByBroadcasterId = new Map<number, KickChannel>();
    for (let i = 0; i < broadcasterIds.length; i += 50) {
      const batch = broadcasterIds.slice(i, i + 50);
      const resp = await kickGet(
        '/channels',
        { broadcaster_user_id: batch },
        token,
      );
      for (const ch of (resp.data as KickChannel[]) ?? []) {
        channelByBroadcasterId.set(ch.broadcaster_user_id, ch);
      }
    }

    // 3) Upsert channels.
    const channelRowIds = new Map<number, string>();
    for (const ls of livestreams) {
      const ch = channelByBroadcasterId.get(ls.broadcaster_user_id);
      const id = await upsertChannel(sb, platformId, {
        broadcaster_user_id: ls.broadcaster_user_id,
        slug: ls.slug,
        display_name: ls.slug, // Kick uses slug as the display handle
        avatar_url: ls.profile_picture ?? null,
        description: ch?.channel_description ?? null,
        banner_url: ch?.banner_picture ?? null,
        subscriber_count: ch?.active_subscribers_count ?? 0,
        language: ls.language ?? null,
      });
      if (id) channelRowIds.set(ls.broadcaster_user_id, id);
    }

    // 4) Upsert content + insert metrics snapshots.
    let processed = 0;
    for (const ls of livestreams) {
      const channelRowId = channelRowIds.get(ls.broadcaster_user_id);
      if (!channelRowId) continue;

      const contentId = await upsertContent(sb, platformId, channelRowId, ls);
      if (!contentId) continue;

      await sb.from('external_content_metrics').insert({
        content_id: contentId,
        view_count: null,
        like_count: null,
        comment_count: null,
        current_viewer_count: ls.viewer_count ?? null,
        extra_data: { source: 'discover_live_kick' },
      });

      processed++;
    }

    return Response.json({
      ok: true,
      languages: TARGET_LANGUAGES,
      unique_livestreams: livestreams.length,
      unique_channels: channelByBroadcasterId.size,
      processed,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('discover-live-kick failed:', e);
    return Response.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
});
