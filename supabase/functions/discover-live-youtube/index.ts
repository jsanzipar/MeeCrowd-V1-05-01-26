// Supabase Edge Function — discover-live-youtube
//
// Pulls the world's top currently-live YouTube streams and ingests them
// as auto-discovered channels + content rows. Designed to run on a schedule
// (Supabase Cron, recommended every 60 min).
//
// Quota cost per run (~204 units, free tier = 10,000/day):
//   search.list  × 2  (eventType=live, relevanceLanguage={en,es})    200
//   videos.list  × 1-2 (50 IDs per call, up to 100 unique IDs)         2
//   channels.list × 1-2 (≤50 unique channels per call)                 2
//   (no comments — too volatile during a live stream, costs 1/video)
//
// 24 runs/day = ~4,900 units, well within free tier alongside the manual
// ingest (~104/day) and refresh-live-metrics (~2,500/day).
//
// Lifecycle:
//   Channels and content created here get discovery_source='live_trending'.
//   Existing rows that show up in trending DO NOT have their discovery_source
//   overwritten — manually-added or user-claimed channels stay 'manual'.
//   The refresh-live-metrics worker DELETES 'live_trending' rows when their
//   stream ends (unless the channel was later claimed by a MeeCrowd user).
//
// Deploy:
//   supabase functions deploy discover-live-youtube
//
// Schedule (Supabase Studio → Cron Jobs):
//   Name:     discover-live-youtube
//   Schedule: 0 * * * *           (every hour)
//   Type:     Edge Function
//   Function: discover-live-youtube

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const YT = 'https://www.googleapis.com/youtube/v3';

interface YtSearchItem {
  id: { videoId?: string };
}

interface YtVideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
    liveBroadcastContent?: string;
    defaultAudioLanguage?: string;
    defaultLanguage?: string;
    categoryId?: string;
    tags?: string[];
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  liveStreamingDetails?: {
    actualStartTime?: string;
    scheduledStartTime?: string;
    concurrentViewers?: string;
  };
  status?: { privacyStatus?: string; madeForKids?: boolean };
}

interface YtChannelItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
    country?: string;
  };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
  brandingSettings?: { channel?: { bannerExternalUrl?: string } };
}

/** Best-quality thumbnail for video posters (prefers larger). */
function pickThumb(thumbs: any): string | null {
  if (!thumbs) return null;
  return (
    thumbs.maxres?.url ??
    thumbs.standard?.url ??
    thumbs.high?.url ??
    thumbs.medium?.url ??
    thumbs.default?.url ??
    null
  );
}

/**
 * Smallest-acceptable thumbnail for channel avatars. The Avatar component
 * renders at 32px (≤64px on retina), so anything beyond 240px wastes
 * bandwidth and causes simultaneous loads of 25+ huge images to fail
 * silently. Prefers default (88px) → medium (240px) → high (800px).
 */
function pickAvatar(thumbs: any): string | null {
  if (!thumbs) return null;
  return (
    thumbs.default?.url ??
    thumbs.medium?.url ??
    thumbs.high?.url ??
    null
  );
}

async function ytFetch(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`${YT}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YT ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function getApiKey(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('value, external_platforms!inner(slug)')
    .eq('credential_type', 'api_key')
    .eq('external_platforms.slug', 'youtube')
    .limit(1)
    .single();
  if (error) throw new Error(`No YouTube API key: ${error.message}`);
  return (data as any).value as string;
}

async function getPlatformId(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb
    .from('external_platforms')
    .select('id')
    .eq('slug', 'youtube')
    .single();
  if (error) throw new Error(`Could not load youtube platform_id: ${error.message}`);
  return (data as any).id as number;
}

/**
 * Insert-or-update a channel row WITHOUT touching discovery_source on
 * existing rows. New rows get 'live_trending'; existing rows keep whatever
 * discovery_source they already had (typically 'manual').
 */
async function upsertChannel(
  sb: SupabaseClient,
  platformId: number,
  c: YtChannelItem,
): Promise<string | null> {
  const snippet = c.snippet ?? {};
  const stats = c.statistics ?? {};
  const branding = c.brandingSettings?.channel ?? ({} as any);

  const fields = {
    platform_id: platformId,
    platform_external_id: c.id,
    handle: snippet.customUrl ?? null,
    display_name: snippet.title ?? null,
    avatar_url: pickAvatar(snippet.thumbnails),
    banner_url: branding.bannerExternalUrl ?? null,
    description: snippet.description ?? null,
    channel_url: `https://www.youtube.com/channel/${c.id}`,
    country: snippet.country ?? null,
    subscriber_count: Number(stats.subscriberCount ?? 0),
    total_view_count: stats.viewCount ?? '0',
    video_count: Number(stats.videoCount ?? 0),
    extra_data: { hiddenSubscriberCount: stats.hiddenSubscriberCount ?? false },
    last_synced_at: new Date().toISOString(),
  };

  // 1) Look up existing row
  const { data: existing } = await sb
    .from('external_channels')
    .select('id')
    .eq('platform_id', platformId)
    .eq('platform_external_id', c.id)
    .maybeSingle();

  if (existing) {
    // UPDATE — leave discovery_source alone
    const { error } = await sb
      .from('external_channels')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) {
      console.error(`channel update ${c.id}:`, error.message);
      return null;
    }
    return (existing as any).id;
  }

  // INSERT — stamp as live_trending (new discovery)
  const { data: inserted, error } = await sb
    .from('external_channels')
    .insert({ ...fields, discovery_source: 'live_trending' })
    .select('id')
    .single();
  if (error) {
    console.error(`channel insert ${c.id}:`, error.message);
    return null;
  }
  return (inserted as any).id;
}

/**
 * Insert-or-update a content row WITHOUT touching discovery_source on
 * existing rows. Returns the row id, or null on error.
 */
async function upsertContent(
  sb: SupabaseClient,
  platformId: number,
  channelRowId: string,
  v: YtVideoItem,
): Promise<string | null> {
  const snippet = v.snippet ?? {};
  const live = v.liveStreamingDetails ?? null;

  const fields = {
    channel_id: channelRowId,
    platform_id: platformId,
    external_id: v.id,
    kind: 'live' as const,
    title: snippet.title ?? null,
    description: snippet.description ?? null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    embed_url: `https://www.youtube.com/embed/${v.id}`,
    thumbnail_url: pickThumb(snippet.thumbnails),
    duration_seconds: null,
    is_live: true,
    language: snippet.defaultAudioLanguage ?? snippet.defaultLanguage ?? null,
    category: snippet.categoryId ?? null,
    published_at: snippet.publishedAt ?? null,
    scheduled_start_at: live?.scheduledStartTime ?? null,
    extra_data: {
      tags: snippet.tags ?? [],
      privacyStatus: v.status?.privacyStatus,
      madeForKids: v.status?.madeForKids,
      actualStartTime: live?.actualStartTime,
      channelTitle: snippet.channelTitle,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', platformId)
    .eq('external_id', v.id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from('external_content')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) {
      console.error(`content update ${v.id}:`, error.message);
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
    console.error(`content insert ${v.id}:`, error.message);
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

    const apiKey = await getApiKey(sb);
    const platformId = await getPlatformId(sb);

    // 1) Discover top live streams in our target languages. YouTube's
    //    relevanceLanguage param accepts ONE ISO-639-1 code at a time, so
    //    we run one search per language in parallel and merge by video ID.
    //
    //    NOTE: search.list with eventType=live REQUIRES a non-empty `q`
    //    parameter — without it, the API returns zero results regardless
    //    of how many live streams exist. We use a single space as a
    //    neutral query so we don't bias toward a keyword in titles.
    //
    //    Quota: 100 units per search × 2 languages = 200 units/run.
    //    24 runs/day = 4,800 units, safely under the 10k free tier.
    const TARGET_LANGUAGES = ['en', 'es']; // English + Spanish

    const searches = await Promise.all(
      TARGET_LANGUAGES.map((lang) =>
        ytFetch(
          '/search',
          {
            part: 'id',
            eventType: 'live',
            type: 'video',
            order: 'viewCount',
            maxResults: '50',
            safeSearch: 'moderate',
            relevanceLanguage: lang,
            q: ' ',
          },
          apiKey,
        ),
      ),
    );

    // Merge and dedupe video IDs across language searches. A stream that
    // ranks high in both languages (rare) is processed once.
    const videoIdSet = new Set<string>();
    for (const s of searches) {
      for (const i of (s.items as YtSearchItem[]) ?? []) {
        if (i.id?.videoId) videoIdSet.add(i.id.videoId);
      }
    }
    const videoIds = Array.from(videoIdSet);

    if (videoIds.length === 0) {
      return Response.json({ ok: true, discovered: 0, note: 'no live streams returned' });
    }

    // 2) Pull full video metadata + live details + statistics. videos.list
    //    accepts up to 50 IDs per call, so batch when we have >50.
    const videoItems: YtVideoItem[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const resp = await ytFetch(
        '/videos',
        {
          part: 'snippet,statistics,contentDetails,liveStreamingDetails,status',
          id: batch.join(','),
        },
        apiKey,
      );
      videoItems.push(...((resp.items as YtVideoItem[]) ?? []));
    }

    // 3) Pull channel snippets+stats for unique channels referenced.
    //    channels.list also has a 50-ID limit, so batch.
    const uniqueChannelIds = Array.from(
      new Set(
        videoItems
          .map((v) => v.snippet?.channelId)
          .filter(Boolean) as string[],
      ),
    );
    const channelItemsAll: YtChannelItem[] = [];
    for (let i = 0; i < uniqueChannelIds.length; i += 50) {
      const batch = uniqueChannelIds.slice(i, i + 50);
      const resp = await ytFetch(
        '/channels',
        {
          part: 'snippet,statistics,brandingSettings',
          id: batch.join(','),
        },
        apiKey,
      );
      channelItemsAll.push(...((resp.items as YtChannelItem[]) ?? []));
    }
    const channelItems = channelItemsAll;

    // 4) Upsert channels.
    const channelRowIds = new Map<string, string>(); // externalId → uuid
    for (const c of channelItems) {
      const id = await upsertChannel(sb, platformId, c);
      if (id) channelRowIds.set(c.id, id);
    }

    // 5) Upsert live content rows + insert metrics snapshots.
    let processed = 0;
    let skippedLanguage = 0;
    for (const v of videoItems) {
      const broadcast = v.snippet?.liveBroadcastContent;
      if (broadcast !== 'live') continue; // safety: search returned non-live

      // Strict language filter. relevanceLanguage is only a *bias*, so the
      // top-by-viewcount list still leaks Hindi/Portuguese/Indonesian when
      // global sports (cricket, football) dominate. Drop anything tagged
      // outside our target languages. We keep:
      //   - en* / es* (incl. en-US, es-MX, es-419, etc.)
      //   - 'zxx' (no linguistic content — instrumental music, ASMR, etc.)
      //   - null/empty (YouTube didn't classify; trust the relevance bias)
      const lang = (
        v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? ''
      )
        .toLowerCase()
        .split('-')[0];
      const allowed = lang === '' || lang === 'zxx' || lang === 'en' || lang === 'es';
      if (!allowed) {
        skippedLanguage++;
        continue;
      }

      const channelExtId = v.snippet?.channelId;
      if (!channelExtId) continue;
      const channelRowId = channelRowIds.get(channelExtId);
      if (!channelRowId) continue;

      const contentId = await upsertContent(sb, platformId, channelRowId, v);
      if (!contentId) continue;

      const stats = v.statistics ?? {};
      const live = v.liveStreamingDetails ?? null;

      await sb.from('external_content_metrics').insert({
        content_id: contentId,
        view_count: stats.viewCount ? Number(stats.viewCount) : null,
        like_count: stats.likeCount ? Number(stats.likeCount) : null,
        comment_count: stats.commentCount ? Number(stats.commentCount) : null,
        current_viewer_count: live?.concurrentViewers
          ? Number(live.concurrentViewers)
          : null,
        extra_data: { source: 'discover_live_youtube' },
      });

      processed++;
    }

    return Response.json({
      ok: true,
      languages: TARGET_LANGUAGES,
      unique_video_ids: videoIds.length,
      videos_returned: videoItems.length,
      unique_channels: channelItems.length,
      processed,
      skipped_language: skippedLanguage,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('discover-live-youtube failed:', e);
    return Response.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
});
