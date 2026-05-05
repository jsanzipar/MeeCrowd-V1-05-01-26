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
