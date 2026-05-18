// Edge Function: sync-creator-content
//
// Pulls a connected creator's full back-catalog (videos + first 20 comments
// each) into external_content for their MeeCrowd profile. Triggered:
//   - Automatically by oauth-callback after a successful connection
//   - Manually by the "Refresh" button on settings/platforms.tsx
//   - Via cron in the future for incremental updates
//
// Inputs (POST body):
//   { user_id?: string, platform?: 'youtube' | 'kick' }
//
// If JWT-protected (caller is the app user), we infer user_id from auth.
// If called from oauth-callback (service-role), user_id must be in body.
//
// Response: { ok, videos_synced, comments_synced, duration_ms }

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const YT = 'https://www.googleapis.com/youtube/v3';
const KICK_API = 'https://api.kick.com/public/v1';
const TWITCH_API = 'https://api.twitch.tv/helix';
const META_API = 'https://graph.facebook.com/v19.0';
const TIKTOK_API = 'https://open.tiktokapis.com/v2';

const VIDEOS_PER_BATCH = 50;
const COMMENTS_PER_VIDEO = 20;
const MAX_VIDEOS_PER_RUN = 1000; // safety cap on first run; subsequent calls are incremental

interface OAuthRow {
  id: string;
  user_id: string;
  platform_id: number;
  channel_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  account_meta: any;
}

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

function pickAvatar(thumbs: any): string | null {
  if (!thumbs) return null;
  return thumbs.default?.url ?? thumbs.medium?.url ?? thumbs.high?.url ?? null;
}

function parseISO8601Duration(s?: string): number | null {
  if (!s) return null;
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

async function refreshYoutubeToken(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<string> {
  // Use the existing token if not yet expired (with 1-min buffer).
  if (row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) {
    return row.access_token;
  }
  if (!row.refresh_token) {
    throw new Error('YouTube access token expired and no refresh_token available — re-connect required');
  }

  const { data: cred } = await sb
    .from('external_platform_credentials')
    .select('credential_type, value, external_platforms!inner(slug)')
    .eq('external_platforms.slug', 'youtube')
    .in('credential_type', ['oauth_client_id', 'oauth_client_secret']);
  const map: Record<string, string> = {};
  for (const r of (cred as any[]) ?? []) map[r.credential_type] = r.value;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
      client_id: map.oauth_client_id,
      client_secret: map.oauth_client_secret,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`YouTube token refresh ${tokenRes.status}: ${await tokenRes.text()}`);
  }
  const j = await tokenRes.json();
  const expiresAt = j.expires_in
    ? new Date(Date.now() + Number(j.expires_in) * 1000).toISOString()
    : null;
  await sb
    .from('user_oauth_tokens')
    .update({ access_token: j.access_token, expires_at: expiresAt })
    .eq('id', row.id);
  return j.access_token;
}

async function getYoutubeApiKey(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb
    .from('external_platform_credentials')
    .select('value, external_platforms!inner(slug)')
    .eq('external_platforms.slug', 'youtube')
    .eq('credential_type', 'api_key')
    .maybeSingle();
  return (data as any)?.value ?? null;
}

async function syncYoutube(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<{ videos: number; comments: number }> {
  let token = await refreshYoutubeToken(sb, row);
  // commentThreads.list rejects youtube.readonly OAuth scope (only
  // youtube.force-ssl works, which is a write scope we don't want).
  // Public comments are accessible via plain API key — use that.
  const apiKey = await getYoutubeApiKey(sb);

  // 1) Find the uploads playlist for the user's channel.
  const chRes = await fetch(`${YT}/channels?part=contentDetails,snippet,statistics&mine=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!chRes.ok) throw new Error(`YT /channels ${chRes.status}: ${await chRes.text()}`);
  const chJson = await chRes.json();
  const channel = chJson.items?.[0];
  if (!channel) throw new Error('No YouTube channel found');
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error('No uploads playlist on this channel');

  // 2) Iterate the uploads playlist to collect all video IDs.
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  while (true) {
    const url = new URL(`${YT}/playlistItems`);
    url.searchParams.set('part', 'contentDetails,status');
    url.searchParams.set('playlistId', uploadsPlaylistId);
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`YT /playlistItems ${res.status}: ${await res.text()}`);
    const j = await res.json();
    for (const item of (j.items as any[]) ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) videoIds.push(id);
    }
    if (videoIds.length >= MAX_VIDEOS_PER_RUN) break;
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }

  // 3) Pull full details + privacy status in 50-video batches.
  let videosSynced = 0;
  let commentsSynced = 0;

  for (let i = 0; i < videoIds.length; i += VIDEOS_PER_BATCH) {
    const batch = videoIds.slice(i, i + VIDEOS_PER_BATCH);
    const url = new URL(`${YT}/videos`);
    url.searchParams.set(
      'part',
      'snippet,statistics,contentDetails,liveStreamingDetails,status',
    );
    url.searchParams.set('id', batch.join(','));

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`YT /videos ${res.status}: ${await res.text()}`);
    const j = await res.json();

    for (const v of (j.items as any[]) ?? []) {
      await upsertYoutubeVideo(sb, row, v);
      videosSynced++;

      // Eager-fetch the first 20 comments per video using the API key
      // (commentThreads doesn't accept youtube.readonly OAuth scope).
      // Private/unlisted videos won't return comments via API key — that's
      // fine, they're surfaced from the Personal tab regardless.
      if (apiKey) {
        const cs = await syncCommentsForVideo(sb, apiKey, v.id, row.platform_id).catch(
          (e) => {
            // 403 = comments disabled or video private; skip silently.
            if (!String(e?.message).includes('403') && !String(e?.message).includes('404')) {
              console.error('comment fetch failed for', v.id, e?.message);
            }
            return 0;
          },
        );
        commentsSynced += cs;
      }
    }
  }

  return { videos: videosSynced, comments: commentsSynced };
}

async function upsertYoutubeVideo(
  sb: SupabaseClient,
  row: OAuthRow,
  v: any,
): Promise<void> {
  const snippet = v.snippet ?? {};
  const stats = v.statistics ?? {};
  const live = v.liveStreamingDetails ?? null;
  const status = v.status ?? {};
  const broadcast = snippet.liveBroadcastContent;
  const isLive = broadcast === 'live';
  const isShort = (v.contentDetails?.duration ?? '').match(/^PT([0-5]?\d)S$/) ? true : false;
  const kind = isLive ? 'live' : broadcast === 'upcoming' ? 'premiere' : isShort ? 'short' : 'video';

  // Map YouTube's privacy status onto our visibility column.
  const visibility: 'public' | 'unlisted' | 'private' =
    status.privacyStatus === 'unlisted'
      ? 'unlisted'
      : status.privacyStatus === 'private'
      ? 'private'
      : 'public';

  const fields = {
    channel_id: row.channel_id!,
    platform_id: row.platform_id,
    external_id: v.id,
    kind,
    title: snippet.title ?? null,
    description: snippet.description ?? null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    embed_url: `https://www.youtube.com/embed/${v.id}`,
    thumbnail_url: pickThumb(snippet.thumbnails),
    duration_seconds: parseISO8601Duration(v.contentDetails?.duration),
    is_live: isLive,
    language: snippet.defaultAudioLanguage ?? snippet.defaultLanguage ?? null,
    category: snippet.categoryId ?? null,
    published_at: snippet.publishedAt ?? null,
    scheduled_start_at: live?.scheduledStartTime ?? null,
    visibility,
    extra_data: {
      tags: snippet.tags ?? [],
      privacyStatus: status.privacyStatus,
      madeForKids: status.madeForKids,
      actualStartTime: live?.actualStartTime,
      actualEndTime: live?.actualEndTime,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', row.platform_id)
    .eq('external_id', v.id)
    .maybeSingle();

  let contentRowId: string;
  if (existing) {
    const { error } = await sb
      .from('external_content')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) throw error;
    contentRowId = (existing as any).id;
  } else {
    const { data: inserted, error } = await sb
      .from('external_content')
      .insert({ ...fields, discovery_source: 'manual' })
      .select('id')
      .single();
    if (error) throw error;
    contentRowId = (inserted as any).id;
  }

  // Insert one metrics snapshot for non-live videos. Live videos get
  // refresh_live_metrics treatment elsewhere.
  await sb.from('external_content_metrics').insert({
    content_id: contentRowId,
    view_count: stats.viewCount ? Number(stats.viewCount) : null,
    like_count: stats.likeCount ? Number(stats.likeCount) : null,
    comment_count: stats.commentCount ? Number(stats.commentCount) : null,
    current_viewer_count: live?.concurrentViewers ? Number(live.concurrentViewers) : null,
    extra_data: { source: 'sync_creator_content' },
  });
}

async function syncCommentsForVideo(
  sb: SupabaseClient,
  apiKey: string,
  videoId: string,
  platformId: number,
): Promise<number> {
  // Get the content row's UUID for the FK.
  const { data: contentRow } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', platformId)
    .eq('external_id', videoId)
    .single();
  if (!contentRow) return 0;
  const contentId = (contentRow as any).id;

  const url = new URL(`${YT}/commentThreads`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('videoId', videoId);
  url.searchParams.set('maxResults', String(COMMENTS_PER_VIDEO));
  url.searchParams.set('order', 'relevance');
  url.searchParams.set('textFormat', 'plainText');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YT /commentThreads ${res.status}`);
  const j = await res.json();
  const nextPageToken: string | null = j.nextPageToken ?? null;

  let inserted = 0;
  for (const item of (j.items as any[]) ?? []) {
    const top = item.snippet?.topLevelComment?.snippet;
    if (!top) continue;
    await sb.from('external_comments').upsert(
      {
        content_id: contentId,
        external_id: item.snippet.topLevelComment.id,
        author_external_id: top.authorChannelId?.value ?? null,
        author_handle: top.authorDisplayName ?? null,
        author_display_name: top.authorDisplayName ?? null,
        author_avatar_url: top.authorProfileImageUrl ?? null,
        body: top.textDisplay ?? '',
        like_count: Number(top.likeCount ?? 0),
        reply_count: Number(item.snippet.totalReplyCount ?? 0),
        posted_at: top.publishedAt ?? null,
        next_page_token: nextPageToken,
      },
      { onConflict: 'content_id,external_id' },
    );
    inserted++;
  }
  return inserted;
}

async function syncKick(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<{ videos: number; comments: number }> {
  // Kick's public API has /channels/{slug}/videos that returns past VODs.
  // We use the slug stored in account_meta from the OAuth callback.
  const slug = row.account_meta?.handle;
  if (!slug) throw new Error('No Kick slug in OAuth metadata');

  // Note: Kick's public REST docs (as of writing) cover livestreams,
  // channels, and categories. A documented past-VOD endpoint returns a
  // 404 in common patterns; the canonical ingest is via direct calls
  // to /api/v2/channels/{slug}/videos which historically worked but is
  // now Cloudflare-protected.
  //
  // For the OAuth path we have a real bearer token, so we try the
  // authenticated path first and gracefully no-op if Kick changes things.

  const url = `${KICK_API}/channels/${slug}/videos?limit=${MAX_VIDEOS_PER_RUN}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${row.access_token}`, Accept: 'application/json' },
  });
  if (res.status === 404) {
    // Endpoint not available — leave a breadcrumb but don't fail the sync
    console.warn('Kick VOD endpoint unavailable for', slug);
    return { videos: 0, comments: 0 };
  }
  if (!res.ok) {
    throw new Error(`Kick /videos ${res.status}: ${await res.text()}`);
  }
  const j = await res.json();
  const videos = (j.data as any[]) ?? [];

  let videosSynced = 0;
  for (const v of videos) {
    await upsertKickVideo(sb, row, v);
    videosSynced++;
  }
  return { videos: videosSynced, comments: 0 };
}

async function upsertKickVideo(sb: SupabaseClient, row: OAuthRow, v: any): Promise<void> {
  const externalId = v.uuid ?? String(v.id);
  if (!externalId) return;

  const fields = {
    channel_id: row.channel_id!,
    platform_id: row.platform_id,
    external_id: externalId,
    kind: 'vod' as const,
    title: v.title ?? v.session_title ?? null,
    description: null,
    url: `https://kick.com/video/${externalId}`,
    embed_url: v.source ?? null,
    thumbnail_url: v.thumbnail?.src ?? v.thumbnail ?? null,
    duration_seconds: v.duration ? Number(v.duration) : null,
    is_live: false,
    language: v.language ?? null,
    category: v.categories?.[0]?.name ?? null,
    published_at: v.created_at ?? v.start_time ?? null,
    scheduled_start_at: null,
    visibility: 'public' as const, // Kick doesn't differentiate
    extra_data: { kick_raw: v },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', row.platform_id)
    .eq('external_id', externalId)
    .maybeSingle();

  if (existing) {
    await sb.from('external_content').update(fields).eq('id', (existing as any).id);
  } else {
    await sb
      .from('external_content')
      .insert({ ...fields, discovery_source: 'manual' });
  }

  // Per-video metrics: Kick's VOD list returns view counts directly.
  if (v.views != null || v.view_count != null) {
    const { data: contentRow } = await sb
      .from('external_content')
      .select('id')
      .eq('platform_id', row.platform_id)
      .eq('external_id', externalId)
      .single();
    if (contentRow) {
      await sb.from('external_content_metrics').insert({
        content_id: (contentRow as any).id,
        view_count: v.views ?? v.view_count ?? null,
        like_count: null,
        comment_count: null,
        current_viewer_count: null,
        extra_data: { source: 'sync_creator_content' },
      });
    }
  }
}

/**
 * Twitch back-catalog: VODs for the user's channel via /helix/videos.
 * The user's OAuth token authorizes us to query their own user_id; we
 * also need the Twitch app client_id for the Client-Id header.
 */
async function getTwitchClientId(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb
    .from('external_platform_credentials')
    .select('value, external_platforms!inner(slug)')
    .eq('external_platforms.slug', 'twitch')
    .eq('credential_type', 'client_id')
    .maybeSingle();
  return (data as any)?.value ?? null;
}

async function syncTwitch(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<{ videos: number; comments: number }> {
  const clientId = await getTwitchClientId(sb);
  if (!clientId) {
    console.warn('Twitch client_id missing — skipping VOD sync');
    return { videos: 0, comments: 0 };
  }
  const userId = row.account_meta?.channel_id;
  if (!userId) {
    console.warn('No Twitch user_id in OAuth metadata');
    return { videos: 0, comments: 0 };
  }

  // Twitch /helix/videos returns up to 100 per page. Paginate via cursor.
  let cursor: string | undefined;
  let videosSynced = 0;
  for (let safety = 0; safety < 20; safety++) {
    const url = new URL(`${TWITCH_API}/videos`);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('first', '100');
    url.searchParams.set('type', 'archive'); // past VODs (vs highlights/uploads)
    if (cursor) url.searchParams.set('after', cursor);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${row.access_token}`,
        'Client-Id': clientId,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Twitch /videos ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const videos = (j.data as any[]) ?? [];
    if (!videos.length) break;

    for (const v of videos) {
      await upsertTwitchVideo(sb, row, v);
      videosSynced++;
    }
    cursor = j.pagination?.cursor;
    if (!cursor) break;
    if (videosSynced >= MAX_VIDEOS_PER_RUN) break;
  }
  return { videos: videosSynced, comments: 0 };
}

async function upsertTwitchVideo(sb: SupabaseClient, row: OAuthRow, v: any): Promise<void> {
  const externalId = String(v.id);

  // Twitch duration is "Xh Ym Zs" — parse to seconds for our schema.
  const dur = (v.duration as string | undefined) ?? '';
  let durationSec: number | null = null;
  const m = dur.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (m && (m[1] || m[2] || m[3])) {
    durationSec = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  }

  // Twitch thumbnails come with {width}x{height} placeholders.
  const thumb = (v.thumbnail_url as string | undefined)?.replace('%{width}', '480').replace('%{height}', '270').replace('{width}', '480').replace('{height}', '270') ?? null;

  // Map Twitch viewability (public/private) onto our visibility column.
  const visibility: 'public' | 'unlisted' | 'private' =
    v.viewable === 'private' ? 'private' : 'public';

  const fields = {
    channel_id: row.channel_id!,
    platform_id: row.platform_id,
    external_id: externalId,
    kind: 'vod' as const,
    title: v.title ?? null,
    description: v.description ?? null,
    url: v.url ?? `https://www.twitch.tv/videos/${externalId}`,
    embed_url: `https://player.twitch.tv/?video=v${externalId}&parent=meecrowd.com`,
    thumbnail_url: thumb,
    duration_seconds: durationSec,
    is_live: false,
    language: v.language ?? null,
    category: null, // Twitch /videos doesn't include game; would need /games extra
    published_at: v.published_at ?? v.created_at ?? null,
    scheduled_start_at: null,
    visibility,
    extra_data: {
      type: v.type,
      stream_id: v.stream_id ?? null,
      muted_segments: v.muted_segments ?? null,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', row.platform_id)
    .eq('external_id', externalId)
    .maybeSingle();

  let contentId: string;
  if (existing) {
    const { error } = await sb
      .from('external_content')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) throw error;
    contentId = (existing as any).id;
  } else {
    const { data: inserted, error } = await sb
      .from('external_content')
      .insert({ ...fields, discovery_source: 'manual' })
      .select('id')
      .single();
    if (error) throw error;
    contentId = (inserted as any).id;
  }

  if (v.view_count != null) {
    await sb.from('external_content_metrics').insert({
      content_id: contentId,
      view_count: Number(v.view_count),
      like_count: null,
      comment_count: null,
      current_viewer_count: null,
      extra_data: { source: 'sync_creator_content' },
    });
  }
}

/**
 * Instagram back-catalog: media (posts/reels/photos) for the connected
 * IG Business/Creator account. The Instagram-native OAuth flow gives us
 * a long-lived token (~60 days) stored on user_oauth_tokens.access_token,
 * and the IG user_id is in account_meta.channel_id.
 *
 * Endpoint host is graph.instagram.com (different from Meta's graph.facebook.com).
 */
const IG_GRAPH = 'https://graph.instagram.com';

async function syncInstagram(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<{ videos: number; comments: number }> {
  const igUserId = row.account_meta?.channel_id;
  // Prefer the long-lived token stored as access_token (Instagram-native flow);
  // fall back to legacy account_meta.page_access_token for old rows that
  // came in via the Meta-graph flow.
  const token = row.access_token ?? row.account_meta?.page_access_token;
  if (!igUserId || !token) {
    console.warn('Instagram: missing channel_id or access_token');
    return { videos: 0, comments: 0 };
  }

  let cursor: string | undefined;
  let synced = 0;
  for (let safety = 0; safety < 10; safety++) {
    const url = new URL(`${IG_GRAPH}/${igUserId}/media`);
    url.searchParams.set(
      'fields',
      'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count,username',
    );
    url.searchParams.set('limit', '50');
    url.searchParams.set('access_token', token);
    if (cursor) url.searchParams.set('after', cursor);

    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`IG /media ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const items = (j.data as any[]) ?? [];
    if (!items.length) break;

    for (const m of items) {
      await upsertInstagramMedia(sb, row, m);
      synced++;
    }
    cursor = j.paging?.cursors?.after;
    if (!j.paging?.next) break;
    if (synced >= MAX_VIDEOS_PER_RUN) break;
  }
  return { videos: synced, comments: 0 };
}

async function upsertInstagramMedia(sb: SupabaseClient, row: OAuthRow, m: any) {
  const externalId = String(m.id);
  // Map IG media_type → our `kind` taxonomy.
  const kind =
    m.media_type === 'VIDEO'
      ? 'video'
      : m.media_type === 'REELS'
      ? 'short'
      : m.media_type === 'CAROUSEL_ALBUM'
      ? 'photo'
      : m.media_type === 'IMAGE'
      ? 'photo'
      : 'post';

  const fields = {
    channel_id: row.channel_id!,
    platform_id: row.platform_id,
    external_id: externalId,
    kind,
    title: m.caption ? String(m.caption).split('\n')[0].slice(0, 200) : null,
    description: m.caption ?? null,
    url: m.permalink ?? null,
    embed_url: m.permalink ? `${m.permalink.replace(/\/$/, '')}/embed` : null,
    thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
    duration_seconds: null,
    is_live: false,
    language: null,
    category: null,
    published_at: m.timestamp ?? null,
    scheduled_start_at: null,
    visibility: 'public' as const,
    extra_data: {
      media_type: m.media_type,
      username: m.username,
      media_url: m.media_url,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', row.platform_id)
    .eq('external_id', externalId)
    .maybeSingle();

  let contentId: string;
  if (existing) {
    const { error } = await sb
      .from('external_content')
      .update(fields)
      .eq('id', (existing as any).id);
    if (error) throw error;
    contentId = (existing as any).id;
  } else {
    const { data: inserted, error } = await sb
      .from('external_content')
      .insert({ ...fields, discovery_source: 'manual' })
      .select('id')
      .single();
    if (error) throw error;
    contentId = (inserted as any).id;
  }

  await sb.from('external_content_metrics').insert({
    content_id: contentId,
    view_count: null,
    like_count: m.like_count != null ? Number(m.like_count) : null,
    comment_count: m.comments_count != null ? Number(m.comments_count) : null,
    current_viewer_count: null,
    extra_data: { source: 'sync_creator_content' },
  });
}

/**
 * Facebook back-catalog: posts from a Page the user admins.
 */
async function syncFacebook(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<{ videos: number; comments: number }> {
  const pageId = row.account_meta?.channel_id;
  const pageToken = row.account_meta?.page_access_token ?? row.access_token;
  if (!pageId || !pageToken) {
    console.warn('Facebook: missing page_id/page_access_token');
    return { videos: 0, comments: 0 };
  }

  let cursor: string | undefined;
  let synced = 0;
  for (let safety = 0; safety < 10; safety++) {
    const url = new URL(`${META_API}/${pageId}/posts`);
    url.searchParams.set(
      'fields',
      'id,message,full_picture,permalink_url,created_time,attachments{type,url,media{image{src}}},reactions.summary(total_count),comments.summary(total_count)',
    );
    url.searchParams.set('limit', '50');
    url.searchParams.set('access_token', pageToken);
    if (cursor) url.searchParams.set('after', cursor);

    const res = await fetch(url);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`FB /posts ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const items = (j.data as any[]) ?? [];
    if (!items.length) break;

    for (const p of items) {
      await upsertFacebookPost(sb, row, p);
      synced++;
    }
    cursor = j.paging?.cursors?.after;
    if (!j.paging?.next) break;
    if (synced >= MAX_VIDEOS_PER_RUN) break;
  }
  return { videos: synced, comments: 0 };
}

async function upsertFacebookPost(sb: SupabaseClient, row: OAuthRow, p: any) {
  const externalId = String(p.id);
  const attachment = p.attachments?.data?.[0];
  const kind = attachment?.type === 'video_inline' || attachment?.type === 'video' ? 'video' : 'post';

  const fields = {
    channel_id: row.channel_id!,
    platform_id: row.platform_id,
    external_id: externalId,
    kind,
    title: p.message ? String(p.message).split('\n')[0].slice(0, 200) : null,
    description: p.message ?? null,
    url: p.permalink_url ?? null,
    embed_url: null, // FB embeds via JS SDK; render text/image card directly
    thumbnail_url: p.full_picture ?? attachment?.media?.image?.src ?? null,
    duration_seconds: null,
    is_live: false,
    language: null,
    category: null,
    published_at: p.created_time ?? null,
    scheduled_start_at: null,
    visibility: 'public' as const,
    extra_data: {
      attachment_type: attachment?.type ?? null,
      attachment_url: attachment?.url ?? null,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', row.platform_id)
    .eq('external_id', externalId)
    .maybeSingle();

  let contentId: string;
  if (existing) {
    const { error } = await sb.from('external_content').update(fields).eq('id', (existing as any).id);
    if (error) throw error;
    contentId = (existing as any).id;
  } else {
    const { data: inserted, error } = await sb
      .from('external_content')
      .insert({ ...fields, discovery_source: 'manual' })
      .select('id')
      .single();
    if (error) throw error;
    contentId = (inserted as any).id;
  }

  const reactions = p.reactions?.summary?.total_count;
  const comments = p.comments?.summary?.total_count;
  await sb.from('external_content_metrics').insert({
    content_id: contentId,
    view_count: null,
    like_count: reactions != null ? Number(reactions) : null,
    comment_count: comments != null ? Number(comments) : null,
    current_viewer_count: null,
    extra_data: { source: 'sync_creator_content' },
  });
}

/**
 * TikTok back-catalog: short videos via /v2/video/list/ (POST).
 *
 * The Display API requires the `video.list` scope (which we requested
 * in oauth-tiktok-start). It returns up to 20 items per call, with
 * `has_more` + `cursor` for pagination.
 */
async function syncTikTok(
  sb: SupabaseClient,
  row: OAuthRow,
): Promise<{ videos: number; comments: number }> {
  let cursor: number | undefined;
  let synced = 0;

  const fields = [
    'id',
    'create_time',
    'cover_image_url',
    'share_url',
    'video_description',
    'duration',
    'height',
    'width',
    'title',
    'embed_html',
    'embed_link',
    'like_count',
    'comment_count',
    'share_count',
    'view_count',
  ];

  for (let safety = 0; safety < 20; safety++) {
    const res = await fetch(`${TIKTOK_API}/video/list/?fields=${fields.join(',')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${row.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        max_count: 20,
        ...(cursor !== undefined ? { cursor } : {}),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`TikTok /video/list ${res.status}: ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const videos = (j?.data?.videos as any[]) ?? [];
    if (!videos.length) break;

    for (const v of videos) {
      await upsertTikTokVideo(sb, row, v);
      synced++;
    }
    if (!j.data?.has_more) break;
    cursor = j.data?.cursor;
    if (synced >= MAX_VIDEOS_PER_RUN) break;
  }

  return { videos: synced, comments: 0 };
}

async function upsertTikTokVideo(sb: SupabaseClient, row: OAuthRow, v: any) {
  const externalId = String(v.id);
  const createTimeSec = Number(v.create_time ?? 0); // unix seconds
  const publishedAt = createTimeSec
    ? new Date(createTimeSec * 1000).toISOString()
    : null;

  const fields = {
    channel_id: row.channel_id!,
    platform_id: row.platform_id,
    external_id: externalId,
    kind: 'short' as const, // TikTok = short-form video
    title: v.title ?? (v.video_description ? String(v.video_description).slice(0, 200) : null),
    description: v.video_description ?? null,
    url: v.share_url ?? null,
    embed_url: v.embed_link ?? `https://www.tiktok.com/embed/v2/${externalId}`,
    thumbnail_url: v.cover_image_url ?? null,
    duration_seconds: v.duration != null ? Number(v.duration) : null,
    is_live: false,
    language: null,
    category: null,
    published_at: publishedAt,
    scheduled_start_at: null,
    visibility: 'public' as const,
    extra_data: {
      width: v.width,
      height: v.height,
      share_count: v.share_count,
    },
    last_synced_at: new Date().toISOString(),
  };

  const { data: existing } = await sb
    .from('external_content')
    .select('id')
    .eq('platform_id', row.platform_id)
    .eq('external_id', externalId)
    .maybeSingle();

  let contentId: string;
  if (existing) {
    const { error } = await sb.from('external_content').update(fields).eq('id', (existing as any).id);
    if (error) throw error;
    contentId = (existing as any).id;
  } else {
    const { data: inserted, error } = await sb
      .from('external_content')
      .insert({ ...fields, discovery_source: 'manual' })
      .select('id')
      .single();
    if (error) throw error;
    contentId = (inserted as any).id;
  }

  await sb.from('external_content_metrics').insert({
    content_id: contentId,
    view_count: v.view_count != null ? Number(v.view_count) : null,
    like_count: v.like_count != null ? Number(v.like_count) : null,
    comment_count: v.comment_count != null ? Number(v.comment_count) : null,
    current_viewer_count: null,
    extra_data: { source: 'sync_creator_content', share_count: v.share_count },
  });
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let userId: string | undefined;
    let platformFilter: 'youtube' | 'kick' | undefined;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      userId = body.user_id;
      platformFilter = body.platform;
    }
    if (!userId) {
      return Response.json({ ok: false, error: 'user_id required' }, { status: 400 });
    }

    // Pull all OAuth tokens for this user, optionally filtered to one platform.
    let q = sb
      .from('user_oauth_tokens')
      .select('*, external_platforms!inner(slug)')
      .eq('user_id', userId)
      .neq('access_token', '__pending__');
    if (platformFilter) q = q.eq('external_platforms.slug', platformFilter);
    const { data: tokens, error } = await q;
    if (error) throw error;
    if (!tokens?.length) {
      return Response.json({ ok: false, error: 'No active OAuth tokens for this user' }, { status: 404 });
    }

    let videosSynced = 0;
    let commentsSynced = 0;

    for (const t of tokens as any[]) {
      const slug = t.external_platforms?.slug;
      const row: OAuthRow = {
        id: t.id,
        user_id: t.user_id,
        platform_id: t.platform_id,
        channel_id: t.channel_id,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: t.expires_at,
        account_meta: t.account_meta,
      };
      if (!row.channel_id) {
        console.error('No channel_id on OAuth row, skipping', t.id);
        continue;
      }
      try {
        if (slug === 'youtube') {
          const { videos, comments } = await syncYoutube(sb, row);
          videosSynced += videos;
          commentsSynced += comments;
        } else if (slug === 'kick') {
          const { videos } = await syncKick(sb, row);
          videosSynced += videos;
        } else if (slug === 'twitch') {
          const { videos } = await syncTwitch(sb, row);
          videosSynced += videos;
        } else if (slug === 'instagram') {
          const { videos } = await syncInstagram(sb, row);
          videosSynced += videos;
        } else if (slug === 'facebook') {
          const { videos } = await syncFacebook(sb, row);
          videosSynced += videos;
        } else if (slug === 'tiktok') {
          const { videos } = await syncTikTok(sb, row);
          videosSynced += videos;
        }
      } catch (e: any) {
        console.error(`sync ${slug} failed:`, e?.message);
      }
    }

    return Response.json({
      ok: true,
      videos_synced: videosSynced,
      comments_synced: commentsSynced,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('sync-creator-content failed:', e);
    return Response.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
});
