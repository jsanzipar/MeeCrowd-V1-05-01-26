// Edge Function: oauth-callback (unified for youtube + kick)
//
// Receives the OAuth provider's redirect after the user grants consent.
// State format: `${platform}|${user_id}|${nonce}` — which we generated
// in oauth-{platform}-start.
//
// Steps:
//   1. Parse state → derive platform + MeeCrowd user_id.
//   2. Exchange `code` for access_token (+ refresh_token if granted).
//   3. Hit the provider's "who am I" endpoint to identify the channel.
//   4. Upsert the channel row + claim it (user_id = MeeCrowd user).
//   5. Persist tokens in user_oauth_tokens.
//   6. Render a tiny HTML success page so the user knows to return to the app.
//      (We don't deep-link back; the app polls connection state instead.)

// deno-lint-ignore-file no-explicit-any

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

interface ProviderConfig {
  tokenUrl: string;
  clientIdField: 'oauth_client_id' | 'client_id';
  clientSecretField: 'oauth_client_secret' | 'client_secret';
  needsPkce: boolean;
}

const CONFIG: Record<'youtube' | 'kick' | 'twitch', ProviderConfig> = {
  youtube: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientIdField: 'oauth_client_id',
    clientSecretField: 'oauth_client_secret',
    needsPkce: false,
  },
  kick: {
    tokenUrl: 'https://id.kick.com/oauth/token',
    clientIdField: 'client_id',
    clientSecretField: 'client_secret',
    needsPkce: true,
  },
  twitch: {
    tokenUrl: 'https://id.twitch.tv/oauth2/token',
    clientIdField: 'client_id',
    clientSecretField: 'client_secret',
    needsPkce: false,
  },
};

async function getCreds(
  sb: SupabaseClient,
  platformSlug: string,
  cfg: ProviderConfig,
): Promise<{ clientId: string; clientSecret: string; platformId: number }> {
  const { data, error } = await sb
    .from('external_platform_credentials')
    .select('credential_type, value, external_platforms!inner(id, slug)')
    .eq('external_platforms.slug', platformSlug)
    .in('credential_type', [cfg.clientIdField, cfg.clientSecretField]);
  if (error || !data?.length) throw new Error(`OAuth creds missing for ${platformSlug}`);
  const map: Record<string, string> = {};
  let platformId = 0;
  for (const row of data as any[]) {
    map[row.credential_type] = row.value;
    platformId = row.external_platforms?.id ?? platformId;
  }
  return {
    clientId: map[cfg.clientIdField],
    clientSecret: map[cfg.clientSecretField],
    platformId,
  };
}

async function fetchYoutubeChannel(accessToken: string) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics,contentDetails,brandingSettings');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`YouTube channel ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.items?.[0] ?? null;
}

async function fetchKickChannel(accessToken: string) {
  // /public/v1/channels?broadcaster_user_id=... requires us to know our own
  // id first. Use /public/v1/users to learn it from the access token.
  const userRes = await fetch('https://api.kick.com/public/v1/users', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!userRes.ok) throw new Error(`Kick /users ${userRes.status}: ${await userRes.text()}`);
  const userJson = await userRes.json();
  const me = userJson.data?.[0];
  if (!me) return null;

  // Now hit /channels?broadcaster_user_id=me.user_id for the channel record.
  const chRes = await fetch(
    `https://api.kick.com/public/v1/channels?broadcaster_user_id=${me.user_id}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  );
  if (!chRes.ok) throw new Error(`Kick /channels ${chRes.status}: ${await chRes.text()}`);
  const chJson = await chRes.json();
  const ch = chJson.data?.[0];
  if (!ch) return null;
  return { ...ch, user: me };
}

async function fetchTwitchChannel(accessToken: string, clientId: string) {
  // /helix/users with no params returns the authenticated user. Twitch
  // doesn't separate "user" and "channel" — login + display_name + id come
  // from this single endpoint.
  const res = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': clientId,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Twitch /users ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const user = j.data?.[0];
  if (!user) return null;

  // Best-effort follower count (requires a scope we may not have; tolerate 401/403).
  let follower_count = 0;
  try {
    const f = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': clientId,
          Accept: 'application/json',
        },
      },
    );
    if (f.ok) {
      const fj = await f.json();
      follower_count = Number(fj.total ?? 0);
    }
  } catch { /* ignore */ }

  return { ...user, follower_count };
}

function html(body: string, opts: { ok?: boolean } = {}): Response {
  const accent = opts.ok ? '#22c55e' : '#ef4444';
  const heading = opts.ok ? 'Connected!' : 'Connection failed';
  return new Response(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MeeCrowd OAuth</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0c0c0f; color: #e8e8ec; padding: 32px; line-height: 1.5;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { max-width: 420px; text-align: center; }
  h1 { color: ${accent}; font-size: 28px; margin-bottom: 16px; }
  p { color: #b8b8c0; }
  .icon { font-size: 48px; margin-bottom: 16px; }
</style></head>
<body><div class="card">
  <div class="icon">${opts.ok ? '✓' : '✗'}</div>
  <h1>${heading}</h1>
  ${body}
  <p style="margin-top:24px;color:#666">You can close this tab and return to the MeeCrowd app.</p>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function oauthCallbackHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return html(`<p>Provider returned: ${errorParam}</p>`, { ok: false });
  }
  if (!code || !state) {
    return html('<p>Missing code or state.</p>', { ok: false });
  }

  const [platformSlug, userId] = state.split('|');
  if (!platformSlug || !userId || !(platformSlug in CONFIG)) {
    return html('<p>Invalid state.</p>', { ok: false });
  }
  const cfg = CONFIG[platformSlug as 'youtube' | 'kick'];

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { clientId, clientSecret, platformId } = await getCreds(sb, platformSlug, cfg);

    // ── 1) Exchange code for tokens ────────────────────────────────────
    // Must match the redirect_uri sent during the authorize step exactly,
    // which is the platform-specific path (registered in each provider's
    // developer console).
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-${platformSlug}-callback`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    if (cfg.needsPkce) {
      // Retrieve the PKCE verifier we stashed during oauth-{platform}-start.
      const { data: pending } = await sb
        .from('user_oauth_tokens')
        .select('account_meta')
        .eq('user_id', userId)
        .eq('platform_id', platformId)
        .single();
      const verifier = (pending as any)?.account_meta?.pkce_verifier;
      if (!verifier) throw new Error('PKCE verifier missing — start handshake again');
      body.set('code_verifier', verifier);
    }

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text().catch(() => '');
      throw new Error(`Token exchange ${tokenRes.status}: ${t.slice(0, 300)}`);
    }
    const token = await tokenRes.json();

    // ── 2) Identify the channel ────────────────────────────────────────
    const channel =
      platformSlug === 'youtube'
        ? await fetchYoutubeChannel(token.access_token)
        : platformSlug === 'twitch'
        ? await fetchTwitchChannel(token.access_token, clientId)
        : await fetchKickChannel(token.access_token);
    if (!channel) throw new Error('Could not load channel info from provider');

    // ── 3) Upsert channel row, mark as claimed ─────────────────────────
    let channelRowId: string | null = null;
    let channelMeta: Record<string, any> = {};

    if (platformSlug === 'youtube') {
      const snippet = channel.snippet ?? {};
      const stats = channel.statistics ?? {};
      const branding = channel.brandingSettings?.channel ?? {};
      const handle = snippet.customUrl ?? null;
      channelMeta = {
        channel_id: channel.id,
        handle,
        display_name: snippet.title,
        avatar_url: snippet.thumbnails?.default?.url ?? null,
      };

      // Look up existing channel row (might exist from a discovery run).
      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle,
        display_name: snippet.title ?? null,
        avatar_url: snippet.thumbnails?.default?.url ?? null,
        banner_url: branding.bannerExternalUrl ?? null,
        description: snippet.description ?? null,
        channel_url: `https://www.youtube.com/channel/${channel.id}`,
        country: snippet.country ?? null,
        subscriber_count: Number(stats.subscriberCount ?? 0),
        total_view_count: stats.viewCount ?? '0',
        video_count: Number(stats.videoCount ?? 0),
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads ?? null },
      };

      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' }) // claimed = manual
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    } else if (platformSlug === 'twitch') {
      // Twitch — single /helix/users call returned everything we need.
      channelMeta = {
        channel_id: channel.id,
        handle: channel.login,
        display_name: channel.display_name,
        avatar_url: channel.profile_image_url ?? null,
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', channel.id)
        .maybeSingle();

      const fields = {
        platform_id: platformId,
        platform_external_id: channel.id,
        handle: channel.login,
        display_name: channel.display_name,
        avatar_url: channel.profile_image_url ?? null,
        banner_url: channel.offline_image_url ?? null,
        description: channel.description ?? null,
        channel_url: `https://www.twitch.tv/${channel.login}`,
        country: null,
        subscriber_count: channel.follower_count ?? 0,
        total_view_count: channel.view_count != null ? String(channel.view_count) : '0',
        video_count: 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { broadcaster_type: channel.broadcaster_type ?? null },
      };

      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    } else {
      // Kick
      const me = channel.user ?? {};
      channelMeta = {
        channel_id: String(channel.broadcaster_user_id),
        handle: channel.slug,
        display_name: me.name ?? channel.slug,
        avatar_url: me.profile_picture ?? null,
      };

      const { data: existing } = await sb
        .from('external_channels')
        .select('id')
        .eq('platform_id', platformId)
        .eq('platform_external_id', String(channel.broadcaster_user_id))
        .maybeSingle();

      const fields = {
        platform_id: platformId,
        platform_external_id: String(channel.broadcaster_user_id),
        handle: channel.slug,
        display_name: me.name ?? channel.slug,
        avatar_url: me.profile_picture ?? null,
        banner_url: channel.banner_picture ?? null,
        description: channel.channel_description ?? null,
        channel_url: `https://kick.com/${channel.slug}`,
        country: null,
        subscriber_count: channel.active_subscribers_count ?? 0,
        total_view_count: '0',
        video_count: 0,
        user_id: userId,
        claimed_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        extra_data: { source: 'oauth_kick_callback' },
      };

      if (existing) {
        const { error } = await sb
          .from('external_channels')
          .update(fields)
          .eq('id', (existing as any).id);
        if (error) throw error;
        channelRowId = (existing as any).id;
      } else {
        const { data: inserted, error } = await sb
          .from('external_channels')
          .insert({ ...fields, discovery_source: 'manual' })
          .select('id')
          .single();
        if (error) throw error;
        channelRowId = (inserted as any).id;
      }
    }

    // ── 4) Persist tokens (overwrite the pending row from -start) ──────
    const expiresAt = token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null;

    const { error: tokErr } = await sb
      .from('user_oauth_tokens')
      .upsert(
        {
          user_id: userId,
          platform_id: platformId,
          channel_id: channelRowId,
          access_token: token.access_token,
          refresh_token: token.refresh_token ?? null,
          token_type: token.token_type ?? 'Bearer',
          scope: token.scope ?? null,
          expires_at: expiresAt,
          account_meta: channelMeta,
        },
        { onConflict: 'user_id,platform_id' },
      );
    if (tokErr) throw tokErr;

    // ── 5) Kick off the backfill (fire and forget) ─────────────────────
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-creator-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ user_id: userId, platform: platformSlug }),
    }).catch((e) => console.error('sync trigger failed (non-fatal):', e));

    // Display handle: YouTube returns customUrl already prefixed with `@`,
    // Kick returns a bare slug. Avoid doubling the `@`.
    const display = (channelMeta.handle ?? channelMeta.display_name ?? '').toString();
    const labeled = display.startsWith('@') ? display : `@${display}`;
    return html(
      `<p>Connected ${platformSlug === 'youtube' ? 'YouTube' : platformSlug === 'twitch' ? 'Twitch' : 'Kick'} as <b>${labeled}</b>.</p>
       <p>We're syncing your back-catalog now — give it a minute and refresh your profile.</p>`,
      { ok: true },
    );
  } catch (e: any) {
    console.error('oauth-callback failed:', e);
    return html(`<p>${e?.message ?? String(e)}</p>`, { ok: false });
  }
}
